"""
Orders in the admin (/manage-store/): see, search, filter and update orders.
Items, prices and history are read-only: an order is a record of what was sold.
Every status change goes through services.set_status().
"""
from django.contrib import admin, messages
from django.contrib.admin.templatetags.admin_list import result_headers
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import DecimalField, Exists, F, OuterRef, Sum
from django.http import HttpResponseBadRequest
from django.shortcuts import get_object_or_404, redirect
from django.urls import path, reverse
from django.utils import formats, timezone
from django.utils.decorators import method_decorator
from django.utils.html import format_html
from django.views.decorators.http import require_POST

from .forms import OrderReviewForm
from .cancellations import decide_cancellation
from .models import Order, OrderCancellationRequest, OrderItem, OrderStatusEvent
from .services import OrderError, set_status

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    fields = ("product_name", "unit_price", "quantity", "line_total")
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


class OrderStatusEventInline(admin.TabularInline):
    """Show the order's status history, newest last."""

    model = OrderStatusEvent
    extra = 0
    can_delete = False
    fields = ("status", "created_at")
    readonly_fields = fields
    verbose_name = "Status change"
    verbose_name_plural = "History"

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    delivery_steps = {
        Order.Status.CONFIRMED: (Order.Status.SHIPPED, "Mark as on the way"),
        Order.Status.SHIPPED: (Order.Status.DELIVERED, "Mark as delivered"),
    }

    list_display = (
        "number", "full_name", "phone", "city", "review_status",
        "items", "order_total", "placed_at",
    )
    list_filter = ("status", "payment_method", "created_at")
    search_fields = ("number", "full_name", "phone", "city")
    show_facets = admin.ShowFacets.ALWAYS
    date_hierarchy = "created_at"
    list_per_page = 5
    inlines = [OrderItemInline, OrderStatusEventInline]

    readonly_fields = (
        "number", "user", "payment_method", "order_total",
        "created_at", "updated_at", "status",
    )
    fieldsets = (
        ("Order", {
            "fields": (
                "number", "status", "payment_method", "order_total",
                "created_at", "updated_at",
            ),
        }),
        ("Customer", {"fields": ("user", "full_name", "phone")}),
        ("Delivery", {"fields": ("city", "street", "note")}),
    )

    def changelist_view(self, request, extra_context=None):
        response = super().changelist_view(request, extra_context)
        context = getattr(response, "context_data", None)
        if not context or "cl" not in context or context.get("is_popup"):
            return response

        cl = context["cl"]
        headers = dict(zip(cl.list_display, result_headers(cl)))
        context["order_register_headers"] = headers
        context["group_orders_by_day"] = headers["placed_at"].get("sort_priority") == 1
        context["register_rows"] = [
            {
                "order": order,
                "url": cl.url_for_result(order),
                "checkbox": self.action_checkbox(order) if "action_checkbox" in headers else None,
                "status": self.review_status(order),
                "total": order._total or 0,
                "units": order._items or 0,
            }
            for order in cl.result_list
        ]
        return response

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            cancellation_pending=Exists(OrderCancellationRequest.objects.filter(
                order_id=OuterRef("pk"), decision=OrderCancellationRequest.Decision.PENDING,
            )),
            _total=Sum(
                F("items__unit_price") * F("items__quantity"),
                output_field=DecimalField(),
            ),
            _items=Sum("items__quantity"),
        )

    @admin.display(description="Total", ordering="_total")
    def order_total(self, obj):
        total = getattr(obj, "_total", None)
        return total if total is not None else obj.total

    @admin.display(description="Items", ordering="_items")
    def items(self, obj):
        return getattr(obj, "_items", None) or obj.item_count

    
    @admin.display(description="Placed at (MYT)", ordering="created_at")
    def placed_at(self, obj):
        local_time = timezone.localtime(obj.created_at)
        return formats.date_format(local_time, "j M Y, H:i")

    @admin.display(description="Status", ordering="status")
    def review_status(self, obj):
        if getattr(obj, "cancellation_pending", False):
            return format_html('<span class="order-review-badge" data-status="pending">{}</span>', "Cancellation requested")
        label = (
            "Pending review"
            if obj.status == Order.Status.PENDING
            else obj.get_status_display()
        )
        return format_html(
            '<span class="order-review-badge" data-status="{}">{}</span>',
            obj.status,
            label,
        )

    def get_urls(self):
        review_urls = [
            path(
                "<int:object_id>/review-action/",
                self.admin_site.admin_view(self.review_action),
                name="orders_order_review_action",
            ),
        ]
        return review_urls + super().get_urls()

    def render_change_form(
        self, request, context, add=False, change=False, form_url="", obj=None,
    ):
        if obj is not None:
            if request.user.has_perm("orders.view_orderstatusevent") or request.user.has_perm("orders.change_orderstatusevent"):
                context["order_activity"] = self.order_activity(obj)
            if self.has_change_permission(request, obj):
                if obj.status == Order.Status.PENDING:
                    context["review_form"] = OrderReviewForm()
                elif obj.status in self.delivery_steps:
                    context["delivery_action"], context["delivery_label"] = self.delivery_steps[obj.status]

            if obj.status == Order.Status.DELIVERED:
                context["delivery_recorded_at"] = (
                    obj.events.filter(status=Order.Status.DELIVERED)
                    .order_by("-created_at", "-pk")
                    .values_list("created_at", flat=True)
                    .first()
                )

        return super().render_change_form(
            request, context, add=add, change=change, form_url=form_url, obj=obj,
        )

    @staticmethod
    def order_activity(order):
        entries = [
            {"time": event.created_at, "label": event.get_status_display(), "status": event.status}
            for event in order.events.order_by("-created_at", "-pk")
        ]
        cancellation = getattr(order, "cancellation_request", None)
        if cancellation:
            entries.append({"time": cancellation.requested_at, "label": "Cancellation requested"})
            if cancellation.reviewed_at:
                entries.append({
                    "time": cancellation.reviewed_at,
                    "label": f"Cancellation {cancellation.get_decision_display().lower()}",
                })
        return sorted(entries, key=lambda entry: entry["time"], reverse=True)

    @method_decorator(require_POST)
    def review_action(self, request, object_id):
        if not self.has_change_permission(request):
            raise PermissionDenied
        return self._apply_review(request, object_id)

    @transaction.atomic
    def _apply_review(self, request, object_id):
        # Reserve the order before reading its request or advancing dispatch.
        # A write here also serializes the two actions on SQLite.
        Order.objects.filter(pk=object_id).update(status=F("status"))
        order = get_object_or_404(
            Order.objects.select_for_update(),
            pk=object_id,
        )
        if not self.has_change_permission(request, order):
            raise PermissionDenied

        detail_url = reverse("admin:orders_order_change", args=[order.pk])

        action = request.POST.get("action")
        if action in ("approve_cancellation", "decline_cancellation"):
            decision = (
                OrderCancellationRequest.Decision.APPROVED if action == "approve_cancellation"
                else OrderCancellationRequest.Decision.DECLINED
            )
            try:
                decide_cancellation(order, request.user, decision, decline_reason=request.POST.get("decline_reason", ""))
            except OrderError as error:
                messages.warning(request, str(error))
            else:
                event = f"Cancellation request {decision}."
                self.log_change(request, order, event)
                messages.success(request, event)
            return redirect(detail_url)

        if action in (Order.Status.SHIPPED, Order.Status.DELIVERED):
            if action == Order.Status.SHIPPED and OrderCancellationRequest.objects.filter(
                order=order, decision=OrderCancellationRequest.Decision.PENDING,
            ).exists():
                messages.warning(request, "Review the customer's cancellation request before dispatch.")
                return redirect(detail_url)
            step = self.delivery_steps.get(order.status)
            if step is None or action != step[0]:
                messages.warning(request, f"This order is already {order.get_status_display().lower()}.")
                return redirect(detail_url)
            set_status(order, step[0])
            label = order.get_status_display()
            self.log_change(request, order, f"Marked order as {label.lower()}.")
            messages.success(request, f"{order.number}: {label}.")
            return redirect(detail_url)

        if order.status != Order.Status.PENDING:
            messages.warning(request, "This order has already been reviewed.")
            return redirect(detail_url)

        if action == "confirm":
            if request.POST.get("review_version") != order.updated_at.isoformat():
                messages.warning(request, "This order was updated. Review the latest details before confirming.")
                return redirect(detail_url)
            form = OrderReviewForm(request.POST)
            if not form.is_valid():
                for errors in form.errors.values():
                    for error in errors:
                        messages.error(request, error)
                return redirect(detail_url)

            start = form.cleaned_data["start"]
            end = form.cleaned_data["end"]
            order.estimated_delivery_start = start
            order.estimated_delivery_end = end
            order.save(update_fields=[
                "estimated_delivery_start",
                "estimated_delivery_end",
            ])

            set_status(order, Order.Status.CONFIRMED)
            self.log_change(
                request, order,
                f"Confirmed order. Estimated delivery: {start} to {end}.",
            )
            messages.success(request, f"{order.number} confirmed.")

        elif action == "cancel":
            set_status(order, Order.Status.CANCELLED)
            self.log_change(request, order, "Cancelled pending order.")
            messages.success(request, f"{order.number} cancelled and stock restored.")

        else:
            return HttpResponseBadRequest("Unknown order review action.")

        return redirect(detail_url)

    def save_model(self, request, obj, form, change):
        if change:
            # A staff edit can arrive after another admin has reviewed the order.
            obj.refresh_from_db(
                fields=["status", "estimated_delivery_start", "estimated_delivery_end"],
                from_queryset=Order.objects.select_for_update(),
            )

        super().save_model(request, obj, form, change)

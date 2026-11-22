from django.contrib import admin
from django.contrib.admin.templatetags.admin_list import result_headers
from django.core.exceptions import PermissionDenied
from django.core.paginator import Paginator
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.template.response import TemplateResponse
from django.urls import path

from ..orders.models import Order
from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_per_page = 5
    list_max_show_all = 5
    list_display = (
        "customer_name",
        "email",
        "store_username",
        "order_count",
        "is_active",
        "date_joined",
    )
    list_display_links = ("customer_name",)
    search_fields = (
        "first_name",
        "last_name",
        "email",
        "customer_profile__username",
    )
    list_filter = ("is_active", "date_joined")
    ordering = ("-date_joined", "-pk")
    fields = list_display
    readonly_fields = fields

    def changelist_view(self, request, extra_context=None):
        response = super().changelist_view(request, extra_context)
        context = getattr(response, "context_data", None)
        if not context or "cl" not in context or context.get("is_popup"):
            return response
        cl = context["cl"]
        filters = {spec.field_path: list(spec.choices(cl)) for spec in cl.filter_specs}
        context["status_choices"] = [
            {**choice, "label": label}
            for choice, label in zip(filters.get("is_active", []), ("All customers", "Active", "Inactive"))
        ]
        context["joined_choices"] = filters.get("date_joined", [])
        context["sort_headers"] = list(result_headers(cl))
        context["can_view_orders"] = self.admin_site.get_model_admin(Order).has_view_permission(request)
        rows = []
        for customer in cl.result_list:
            name = self.customer_name(customer)
            rows.append({
                "customer": customer,
                "name": name,
                "initials": "".join(word[0] for word in name.split()[:2]).upper(),
                "username": self.store_username(customer),
            })
        context["directory_rows"] = rows
        return response

    def get_urls(self):
        return [
            path(
                "<int:customer_id>/orders/",
                self.admin_site.admin_view(self.customer_orders),
                name="accounts_customer_orders",
            ),
        ] + super().get_urls()

    def customer_orders(self, request, customer_id):
        order_admin = self.admin_site.get_model_admin(Order)
        if not self.has_view_permission(request) or not order_admin.has_view_permission(request):
            raise PermissionDenied
        customer = get_object_or_404(self.get_queryset(request), pk=customer_id)
        if not self.has_view_permission(request, customer):
            raise PermissionDenied
        orders = order_admin.get_queryset(request).filter(user_id=customer.pk).order_by("-created_at", "-pk")
        can_view_items = request.user.has_perm("orders.view_orderitem") or request.user.has_perm("orders.change_orderitem")
        if can_view_items:
            orders = orders.prefetch_related("items")
        paginator = Paginator(orders, 5)
        page = paginator.get_page(request.GET.get("page"))
        request.current_app = self.admin_site.name
        return TemplateResponse(request, "admin/accounts/customer/orders.html", {
            **self.admin_site.each_context(request),
            "title": f"Orders · {self.customer_name(customer)}",
            "opts": self.opts,
            "name": self.customer_name(customer),
            "username": self.store_username(customer),
            "page": page,
            "order_rows": [
                {"order": order, "total": order._total or 0, "units": order._items or 0}
                for order in page
            ],
            "can_view_items": can_view_items,
            "preserved_filters": self.get_preserved_filters(request),
        })

    def get_queryset(self, request):
        return (
            super().get_queryset(request)
            .filter(is_staff=False, is_superuser=False)
            .select_related("customer_profile")
            .annotate(number_of_orders=Count("orders"))
        )

    @admin.display(description="Customer", ordering="first_name")
    def customer_name(self, customer):
        return customer.get_full_name() or customer.email or customer.get_username()

    @admin.display(description="Store username", ordering="customer_profile__username")
    def store_username(self, customer):
        profile = getattr(customer, "customer_profile", None)
        return profile.username if profile else None

    @admin.display(description="Orders", ordering="number_of_orders")
    def order_count(self, customer):
        return customer.number_of_orders

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

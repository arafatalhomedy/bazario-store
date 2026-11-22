from decimal import Decimal, ROUND_HALF_UP

from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Case, F, Q, When
from django.http import Http404, HttpResponseBadRequest
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from .models import Product


CENT = Decimal("0.01")
ON_SALE = {"compare_at_price__gt": F("price")}


def price_snapshot(product):
    key = f"{product.pk}:{product.price}:{product.compare_at_price}"
    if product.promotion_ends:
        start = product.promotion_starts.isoformat() if product.promotion_starts else "now"
        key += f":{start}:{product.promotion_ends.isoformat()}:{product.queued_price}"
    return key


def discount_rate(product):
    regular = product.compare_at_price if product.is_on_sale else product.price
    sale = product.price if product.is_on_sale else product.queued_price
    percent = (regular - sale) * 100 / regular
    return min(Decimal("99.99"), max(CENT, percent.quantize(CENT, rounding=ROUND_HALF_UP)))


class PromotionForm(forms.Form):
    product = forms.ChoiceField()
    discount = forms.DecimalField(min_value=CENT, max_value=Decimal("99.99"), decimal_places=2)
    timing = forms.ChoiceField(
        choices=(("now", "Start now"), ("later", "Schedule for later")), widget=forms.RadioSelect,
    )
    starts = forms.DateTimeField(label="Starts (MYT)", required=False,
        widget=forms.DateTimeInput(format="%Y-%m-%dT%H:%M", attrs={"type": "datetime-local"}))
    ends = forms.DateTimeField(label="Ends (MYT)", required=False,
        widget=forms.DateTimeInput(format="%Y-%m-%dT%H:%M", attrs={"type": "datetime-local"}))

    def clean_window(self, product):
        end = self.cleaned_data["ends"]
        now = timezone.now()
        if self.cleaned_data["timing"] == "now":
            if end is not None and end <= now:
                self.add_error("ends", "Choose a future end time or leave it blank.")
            return None, end
        start = self.cleaned_data["starts"]
        # An already running scheduled sale keeps its original start when edited.
        if not start or (start <= now and not (product.is_on_sale and start == product.promotion_starts)):
            self.add_error("starts", "Choose a future start time.")
        if not end or end <= now or (start and end <= start):
            self.add_error("ends", "Choose an end time after the start and in the future.")
        return start, end


@require_http_methods(["GET", "POST"])
@timezone.override("Asia/Kuala_Lumpur")
def promotions(request):
    catalog = admin.site.get_model_admin(Product)
    if not catalog.has_view_or_change_permission(request):
        raise PermissionDenied
    request.current_app = admin.site.name
    products = catalog.get_queryset(request).select_related("category").order_by("name", "pk")
    context = {**admin.site.each_context(request), "title": "Promotions",
               "can_manage": catalog.has_change_permission(request)}
    editing = request.GET.get("edit")
    page_number = request.GET.get("page", "1")
    list_url = reverse("bazario_promotions")
    if page_number.isascii() and page_number.isdecimal() and len(page_number) <= 10 and int(page_number) > 1:
        list_url += f"?page={int(page_number)}"
    context["list_url"] = list_url
    creating = request.GET.get("new") == "1"
    eligible = products.exclude(**ON_SALE).filter(queued_price__isnull=True)
    if editing is None and not creating:
        if request.method != "GET":
            return HttpResponseBadRequest("Open a promotion before saving.")
        scheduled_start = Case(When(queued_price__isnull=False, then=F("promotion_starts")))
        promotions_list = products.filter(Q(**ON_SALE) | Q(queued_price__isnull=False)).order_by(
            scheduled_start.asc(nulls_first=True), "name", "pk",
        )
        page = Paginator(promotions_list, 5).get_page(page_number)
        sales, upcoming = [], []
        for product in page:
            product.promotion_rate = discount_rate(product)
            if product.queued_price is None:
                sales.append(product)
            else:
                upcoming.append(product)
        context.update(sales=sales, upcoming=upcoming, page=page,
                       active_count=products.filter(**ON_SALE).count(), available=eligible.exists())
        return render(request, "admin/products/promotions.html", context)

    if not context["can_manage"]:
        raise PermissionDenied
    if editing is not None:
        if not editing.isascii() or not editing.isdigit() or len(editing) > 18:
            raise Http404
        available = list(products.filter(Q(**ON_SALE) | Q(queued_price__isnull=False), pk=int(editing)))
        if not available:
            messages.info(request, "This promotion has already ended.")
            return redirect(list_url)
    else:
        available = list(eligible)
    options = {price_snapshot(product): product for product in available}
    current = available[0] if available else None
    data = request.POST.copy() if request.method == "POST" else None
    if data is not None and "timing" not in data and not (editing and current.promotion_ends):
        # Previously opened immediate-promotion forms can still be submitted.
        data["timing"] = "now"
    form = PromotionForm(data, initial={
        "product": price_snapshot(current) if current else "",
        "discount": discount_rate(current) if editing else 15,
        "timing": "later" if editing and current.promotion_starts else "now",
        "starts": current.promotion_starts if editing else None,
        "ends": current.promotion_ends if editing else None,
    })
    form.fields["product"].choices = [(key, p.name) for key, p in options.items()]
    form.fields["product"].error_messages["invalid_choice"] = "The product price has changed. Check the latest price and select the product again."
    if request.method == "POST":
        action = request.POST.get("action")
        if action not in ("save", "end") or (action == "end" and not editing):
            return HttpResponseBadRequest("Unknown promotion action.")
        if action == "end":
            for field in ("discount", "timing", "starts", "ends"):
                form.fields.pop(field)
        if form.is_valid():
            product = options[form.cleaned_data["product"]]
            if not catalog.has_change_permission(request, product):
                raise PermissionDenied
            regular = product.compare_at_price if product.is_on_sale else product.price
            original = product.price
            sale = regular
            start = end = None
            if action == "save":
                start, end = form.clean_window(product)
                rate = form.cleaned_data["discount"]
                if editing and rate == discount_rate(product):
                    sale = product.queued_price if product.queued_price is not None else original
                else:
                    sale = (regular * (100 - rate) / 100).quantize(CENT, rounding=ROUND_HALF_UP)
                if sale < CENT or sale >= regular:
                    form.add_error("discount", "Choose a discount that reduces the price by at least $0.01 and leaves a positive sale price.")
            if not form.errors:
                now = timezone.now()
                queued = start is not None and start > now
                live = action == "save" and not queued
                with transaction.atomic():
                    changed = Product.objects.filter(
                        pk=product.pk, price=original, compare_at_price=product.compare_at_price,
                        promotion_starts=product.promotion_starts, promotion_ends=product.promotion_ends,
                        queued_price=product.queued_price,
                    ).update(
                        price=sale if live else regular, compare_at_price=regular if live else None,
                        queued_price=sale if queued else None, promotion_starts=start, promotion_ends=end, updated_at=now,
                    )
                    if changed:
                        note = "Promotion scheduled" if queued else "Promotion saved"
                        if action == "end":
                            note = "Schedule cancelled" if product.queued_price is not None else "Promotion ended"
                        catalog.log_change(request, product, f"{note}. Storefront price: ${sale if live else regular:.2f}.")
                if changed:
                    messages.success(request, f"{note} for {product.name}.")
                else:
                    messages.warning(request, "Another edit changed the price. Review it before saving again.")
                return redirect(list_url)
        if action == "end":
            # A stale end request returns to the list with the latest prices.
            messages.warning(request, "Pricing changed. Review the promotion and try again.")
            return redirect(list_url)
    context.update(editor=True, editing=bool(editing), pending=bool(editing and current.queued_price is not None), form=form, available=bool(options),
                   active_count=products.filter(**ON_SALE).count(),
                   pricing={key: {"regular": str(p.compare_at_price if p.is_on_sale else p.price),
                                  "sale": str(p.queued_price if p.queued_price is not None else p.price), "rate": str(discount_rate(p)) if editing else ""}
                            for key, p in options.items()})
    return render(request, "admin/products/promotions.html", context)

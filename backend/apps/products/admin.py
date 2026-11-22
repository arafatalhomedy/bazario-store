"""Admin screens for the product catalog."""
from decimal import ROUND_HALF_UP
from urllib.parse import urlencode

from django import forms
from django.contrib import admin
from django.contrib.admin.templatetags.admin_urls import add_preserved_filters
from django.db.models import Count, F, Q
from django.urls import reverse
from django.utils.html import format_html

from .models import LOW_STOCK_THRESHOLD, Category, Product
from .promotions import CENT, price_snapshot


class ProductPricingForm(forms.ModelForm):
    price_snapshot = forms.CharField(required=False, widget=forms.HiddenInput)

    class Meta:
        model = Product
        exclude = ("compare_at_price",)
        labels = {"price": "Regular price ($)"}

    class Media:
        js = ("js/pages/admin-product-discount.js",)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        product = self.instance
        if product.pk and "price" in self.fields:
            self.initial["price_snapshot"] = price_snapshot(product)
            if product.is_on_sale:
                self.initial["price"] = product.compare_at_price
                self.fields["price"].widget.attrs.update({
                    "data-regular": str(product.compare_at_price),
                    "data-sale": str(product.price),
                })

    def clean(self):
        data = super().clean()
        product = self.instance
        regular = data.get("price")
        if not product.pk or regular is None:
            return data
        if data.get("price_snapshot") != price_snapshot(product):
            self.add_error("price", "Pricing has changed. Reopen this product to use the latest price.")
        elif product.is_on_sale:
            if regular == product.compare_at_price:
                data["price"] = product.price
            else:
                sale = (regular * product.price / product.compare_at_price).quantize(CENT, rounding=ROUND_HALF_UP)
                if sale < CENT or sale >= regular:
                    self.add_error("price", "This price is too small for the current discount.")
                else:
                    product.compare_at_price = regular
                    data["price"] = sale
        elif product.queued_price is not None and regular != product.price:
            queued = (regular * product.queued_price / product.price).quantize(CENT, rounding=ROUND_HALF_UP)
            if not CENT <= queued < regular:
                self.add_error("price", "This price is too small for the scheduled discount.")
            else:
                product.queued_price = queued
        elif "price" in self.changed_data:
            product.compare_at_price = None
        return data


class CategoryNameForm(forms.ModelForm):
    class Meta:
        model = Category
        fields = ("name",)

    def clean_name(self):
        name = self.cleaned_data["name"]
        matches = Category.objects.filter(name__iexact=name).exclude(pk=self.instance.pk)
        if matches.exists():
            raise forms.ValidationError("A category with this name already exists.")
        return name


class CategoryInventoryFilter(admin.SimpleListFilter):
    title = "inventory"
    parameter_name = "empty"

    def lookups(self, request, model_admin):
        return (("yes", "Empty categories"),)

    def queryset(self, request, queryset):
        if self.value() == "yes":
            return queryset.filter(inventory_count=0)
        return queryset


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    form = CategoryNameForm
    list_display = ("name", "slug", "product_count")
    list_filter = (CategoryInventoryFilter,)
    search_fields = ("name", "slug")
    readonly_fields = ("slug",)
    fields = ("name", "slug")

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(inventory_count=Count("products"))

    @admin.display(description="Products", ordering="inventory_count")
    def product_count(self, obj):
        return obj.inventory_count

    def products_url(self, request, category):
        if request.user.has_perm("products.view_product") or request.user.has_perm("products.change_product"):
            url = reverse(f"{self.admin_site.name}:products_product_changelist")
            return f"{url}?{urlencode({'category__id__exact': category.pk})}"
        return None

    def changelist_view(self, request, extra_context=None):
        response = super().changelist_view(request, extra_context=extra_context)
        context = getattr(response, "context_data", None)
        if not context or "cl" not in context or context["cl"].is_popup:
            return response

        cl = context["cl"]
        scope = {"opts": self.opts, "preserved_filters": context["preserved_filters"]}

        def category_url(action, category=None):
            name = f"{self.admin_site.name}:products_category_{action}"
            url = reverse(name, args=[category.pk] if category else None)
            return add_preserved_filters(scope, url)

        art = {"accessories": "coral", "audio": "audio", "home": "home", "stationery": "paper"}
        rows = [
            {
                "category": category,
                "art": art.get(category.slug, "lime"),
                "products_url": self.products_url(request, category),
                "change_url": category_url("change", category),
                "can_change": self.has_change_permission(request, category),
                "delete_url": category_url("delete", category) if self.has_delete_permission(request, category) else None,
            }
            for category in cl.result_list
        ]
        filter_key = CategoryInventoryFilter.parameter_name
        base = cl.get_queryset(request, exclude_parameters=[filter_key])
        empty_only = cl.params.get(filter_key) == "yes"
        count_column = cl.list_display.index("product_count")
        ordering = ((None, "Name A–Z"), (f"-{count_column}", "Most products"), (str(count_column), "Fewest products"))
        context.update(
            category_rows=rows,
            category_add_url=category_url("add") if self.has_add_permission(request) else None,
            category_total=base.count(),
            category_empty=base.filter(inventory_count=0).count(),
            category_empty_only=empty_only,
            category_empty_url=cl.get_query_string({filter_key: None if empty_only else "yes"}),
            category_order=[
                {"label": label, "url": cl.get_query_string({"o": key}), "active": cl.params.get("o") == key}
                for key, label in ordering
            ],
        )
        return response

    def render_change_form(self, request, context, add=False, change=False, form_url="", obj=None):
        response = super().render_change_form(request, context, add, change, form_url, obj)
        if request.headers.get("X-Bazario-Panel") == "category" and not context["is_popup"]:
            if add or context["has_change_permission"]:
                response.template_name = "admin/products/category/gallery_editor.html"
        return response

    def render_delete_form(self, request, context):
        response = super().render_delete_form(request, context)
        if request.headers.get("X-Bazario-Panel") == "category" and not context["is_popup"]:
            category = context["object"]
            context["category_products_url"] = self.products_url(request, category)
            response.template_name = "admin/products/category/gallery_delete.html"
        return response


class CatalogFilter(admin.SimpleListFilter):
    title = "stock and sales"
    parameter_name = "catalog"

    def lookups(self, request, model_admin):
        return (
            ("low", "Low stock"),
            ("out", "Sold out"),
            ("sale", "On sale"),
        )

    def queryset(self, request, queryset):
        if self.value() == "low":
            return queryset.filter(stock__gt=0, stock__lte=LOW_STOCK_THRESHOLD)
        if self.value() == "out":
            return queryset.filter(stock=0)
        if self.value() == "sale":
            return queryset.filter(compare_at_price__gt=F("price"))
        return queryset


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    form = ProductPricingForm
    fields = (
        "name", "slug", "category", "description", "price", "price_snapshot",
        "stock", "is_active", "image", "preview", "created_at", "updated_at",
    )
    list_display = (
        "catalog_product", "category", "price", "sale_info",
        "stock", "is_active", "created_at",
    )
    list_display_links = ("catalog_product",)
    list_per_page = 8
    list_max_show_all = 0
    list_filter = (CatalogFilter, "is_active", "category")
    list_select_related = ("category",)
    search_fields = ("name", "description")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("preview", "created_at", "updated_at")

    def get_fields(self, request, obj=None):
        fields = super().get_fields(request, obj)
        if obj and not self.has_change_permission(request, obj):
            return tuple(field for field in fields if field != "price_snapshot")
        return fields

    def get_queryset(self, request):
        products = super().get_queryset(request)
        if request.method == "POST" and getattr(request.resolver_match, "url_name", None) == "products_product_change":
            return products.select_for_update()
        return products

    @admin.display(description="Product", ordering="name")
    def catalog_product(self, obj):
        return format_html(
            '<span class="bazario-products__item">'
            '<span class="bazario-products__thumb" aria-hidden="true">{}</span>'
            '<b>{}</b></span>',
            self.preview(obj),
            obj.name,
        )

    @admin.display(description="Sale")
    def sale_info(self, obj):
        if not obj.is_on_sale:
            return "—"
        return format_html(
            '<span class="bazario-products__sale"><s>{}</s><b>{}% off</b></span>',
            f"${obj.compare_at_price:,.2f}",
            obj.discount_percent,
        )

    @admin.display(description="Image")
    def preview(self, obj):
        if not obj.thumbnail:
            return "—"
        return format_html(
            '<img src="{}" alt="" width="48" height="48" style="border-radius:8px;object-fit:cover">',
            obj.thumbnail.url,
        )

    def changelist_view(self, request, extra_context=None):
        response = super().changelist_view(request, extra_context=extra_context)
        context = getattr(response, "context_data", None)
        if not context or "cl" not in context or context["cl"].is_popup:
            return response

        cl = context["cl"]
        scope = {"opts": self.opts, "preserved_filters": context["preserved_filters"]}

        def product_url(action, product=None):
            name = f"{self.admin_site.name}:products_product_{action}"
            url = reverse(name, args=[product.pk] if product else None)
            return add_preserved_filters(scope, url)

        rows = []
        for product in cl.result_list:
            if product.is_sold_out:
                stock_state, stock_label = "out", "Sold out"
            elif product.is_low_stock:
                stock_state, stock_label = "low", f"{product.stock} left"
            else:
                stock_state, stock_label = "ready", f"{product.stock} in stock"
            rows.append({
                "product": product,
                "price": f"${product.price:,.2f}",
                "regular": f"${product.compare_at_price:,.2f}" if product.is_on_sale else None,
                "stock_state": stock_state,
                "stock_label": stock_label,
                "can_change": self.has_change_permission(request, product),
                "change_url": product_url("change", product),
                "delete_url": product_url("delete", product) if self.has_delete_permission(request, product) else None,
            })

        tab_key = CatalogFilter.parameter_name
        counts = cl.get_queryset(request, exclude_parameters=[tab_key]).aggregate(
            all=Count("pk"),
            low=Count("pk", filter=Q(stock__gt=0, stock__lte=LOW_STOCK_THRESHOLD)),
            out=Count("pk", filter=Q(stock=0)),
            sale=Count("pk", filter=Q(compare_at_price__gt=F("price"))),
        )
        stock_filter = next(spec for spec in cl.filter_specs if isinstance(spec, CatalogFilter))
        quick_tabs = [(None, "All products"), *stock_filter.lookup_choices]
        ordering = (
            (None, "Newest first"),
            (str(cl.list_display.index("catalog_product")), "Product name"),
            (str(cl.list_display.index("price")), "Lowest price"),
            (f'-{cl.list_display.index("price")}', "Highest price"),
            (str(cl.list_display.index("stock")), "Lowest stock"),
        )

        context.update(
            catalog_add_url=product_url("add") if self.has_add_permission(request) else None,
            catalog_rows=rows,
            catalog_tabs=[
                {
                    "label": label, "url": cl.get_query_string({tab_key: key}),
                    "count": counts[key or "all"], "active": stock_filter.value() == key,
                }
                for key, label in quick_tabs
            ],
            catalog_order=[
                {"label": label, "url": cl.get_query_string({"o": key}), "active": cl.params.get("o") == key}
                for key, label in ordering
            ],
        )
        return response

    def render_change_form(self, request, context, add=False, change=False, form_url="", obj=None):
        response = super().render_change_form(request, context, add, change, form_url, obj)
        if request.headers.get("X-Bazario-Panel") == "product" and not context["is_popup"]:
            if add or context["has_change_permission"]:
                response.template_name = "admin/products/product/workspace_editor.html"
        return response

    def render_delete_form(self, request, context):
        response = super().render_delete_form(request, context)
        if request.headers.get("X-Bazario-Panel") == "product" and not context["is_popup"]:
            response.template_name = "admin/products/product/workspace_delete.html"
        return response

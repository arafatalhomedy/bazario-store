"""Business logic for querying products. Views stay thin and call these functions."""
from datetime import timedelta

from django.db.models import Count, OuterRef, Q, Subquery
from django.db.models.functions import Lower
from django.utils import timezone

from .models import NEW_PRODUCT_DAYS, Category, Product

SORT_OPTIONS = {
    "newest": ("-created_at", "-id"),
    "price_asc": ("price", "id"),
    "price_desc": ("-price", "id"),
    "name": ("name", "id"),
}
DEFAULT_SORT = "newest"
MAX_SEARCH_LENGTH = 100


def visible_products():
    """Products customers are allowed to see."""
    return Product.objects.filter(is_active=True).select_related("category")


def filter_products(*, search="", category="", sort="", new_only=False):
    """Apply search, category filter and sort from the shop's query parameters."""
    queryset = visible_products()

    search = search.strip()[:MAX_SEARCH_LENGTH]
    if search:
        queryset = queryset.filter(
            Q(name__icontains=search)
            | Q(description__icontains=search)
            | Q(category__name__icontains=search)
        )

    if category:
        queryset = queryset.filter(category__slug=category)

    if new_only:
        since = timezone.now() - timedelta(days=NEW_PRODUCT_DAYS)
        queryset = queryset.filter(created_at__gte=since)

    ordering = SORT_OPTIONS.get(sort, SORT_OPTIONS[DEFAULT_SORT])
    return queryset.order_by(*ordering)


def categories_with_products(*, include_empty=False):
    """
    Categories ordered by name, each with:
      - product_count: how many visible products it has
      - cover: the thumbnail path of its newest product with a photo
    Include empty categories when they need an entry in the storefront navigation.
    """
    newest_photo = (
        Product.objects
        .filter(category=OuterRef("pk"), is_active=True)
        .exclude(thumbnail="")
        .order_by("-created_at")
        .values("thumbnail")[:1]
    )
    categories = (
        Category.objects
        .annotate(product_count=Count("products", filter=Q(products__is_active=True)))
        .annotate(cover=Subquery(newest_photo))
        .order_by(Lower("name"), "name")
    )
    return categories if include_empty else categories.filter(product_count__gt=0)


RELATED_LIMIT = 5  # how many products to suggest


def related_products(product, limit=RELATED_LIMIT):
    """
    Products to suggest on a product page:
    same category first, then the newest from other categories (never empty).
    """
    others = visible_products().exclude(pk=product.pk).order_by("-created_at")

    suggestions = list(others.filter(category=product.category)[:limit])
    if len(suggestions) < limit:
        missing = limit - len(suggestions)
        suggestions += list(others.exclude(category=product.category)[:missing])
    return suggestions


def product_position(product):
    """
    The product's number in the shop (newest first), e.g. (1, 16) for "№ 01 of 16".
    """
    shop = visible_products()
    position = shop.filter(created_at__gt=product.created_at).count() + 1
    return position, shop.count()

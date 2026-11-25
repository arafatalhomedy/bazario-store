"""API endpoints for the product catalog."""
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_control
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination

from .serializers import CategoryListSerializer, ProductDetailSerializer, ProductListSerializer
from .services import categories_with_products, filter_products, visible_products

# The catalog looks the same for everyone, so Vercel's CDN may keep an answer
# for 30 s and keep serving it for up to 5 min while it refreshes in the background.
# (Browsers always re-check: max_age=0.) Baskets and orders are NOT cached.
CATALOG_CACHE = cache_control(public=True, max_age=0, s_maxage=30, stale_while_revalidate=300)


class ProductPagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 48


@method_decorator(CATALOG_CACHE, name="dispatch")
class ProductListView(generics.ListAPIView):
    """GET /api/products/?search=&category=&sort=&page="""

    serializer_class = ProductListSerializer
    pagination_class = ProductPagination
    authentication_classes = []   # public: no login or session needed, so it can be cached

    def get_queryset(self):
        params = self.request.query_params
        return filter_products(
            search=params.get("search", ""),
            category=params.get("category", ""),
            sort=params.get("sort", ""),
            new_only=params.get("new") == "1",
        )


@method_decorator(CATALOG_CACHE, name="dispatch")
class CategoryListView(generics.ListAPIView):
    """GET /api/categories/?include_empty=1 includes storefront categories with no visible products."""

    serializer_class = CategoryListSerializer
    pagination_class = None
    authentication_classes = []

    def get_queryset(self):
        return categories_with_products(include_empty=self.request.query_params.get("include_empty") == "1")


@method_decorator(CATALOG_CACHE, name="dispatch")
class ProductDetailView(generics.RetrieveAPIView):
    """GET /api/products/<slug>/ : one visible product + its number + suggestions."""

    serializer_class = ProductDetailSerializer
    lookup_field = "slug"
    authentication_classes = []

    def get_queryset(self):
        return visible_products()  # hidden products → 404 "not found"
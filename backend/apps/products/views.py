"""API endpoints for the product catalog."""
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination

from .serializers import CategoryListSerializer, ProductDetailSerializer, ProductListSerializer
from .services import categories_with_products, filter_products, visible_products


class ProductPagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 48


class ProductListView(generics.ListAPIView):
    """GET /api/products/?search=&category=&sort=&page="""

    serializer_class = ProductListSerializer
    pagination_class = ProductPagination

    def get_queryset(self):
        params = self.request.query_params
        return filter_products(
            search=params.get("search", ""),
            category=params.get("category", ""),
            sort=params.get("sort", ""),
            new_only=params.get("new") == "1",
        )


class CategoryListView(generics.ListAPIView):
    """GET /api/categories/?include_empty=1 includes storefront categories with no visible products."""

    serializer_class = CategoryListSerializer
    pagination_class = None

    def get_queryset(self):
        return categories_with_products(include_empty=self.request.query_params.get("include_empty") == "1")



class ProductDetailView(generics.RetrieveAPIView):
    """GET /api/products/<slug>/ : one visible product + its number + suggestions."""

    serializer_class = ProductDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return visible_products()  # hidden products → 404 "not found"

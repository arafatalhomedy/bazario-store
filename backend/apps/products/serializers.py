"""Convert products and categories to JSON for the frontend."""
from django.core.files.storage import default_storage
from rest_framework import serializers

from .models import Category, Product
from .services import product_position, related_products


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class CategoryListSerializer(CategorySerializer):
    """Category + product count + newest product photo (used by the ribbons)."""

    product_count = serializers.IntegerField(read_only=True)
    image = serializers.SerializerMethodField()

    class Meta(CategorySerializer.Meta):
        fields = CategorySerializer.Meta.fields + ["product_count", "image"]

    def get_image(self, obj):
        # obj.cover is a file path like "products/thumbs/x.webp" → turn it into a URL
        return default_storage.url(obj.cover) if obj.cover else None


class ProductListSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    image = serializers.SerializerMethodField()
    thumbnail = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()
    badges = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "price", "compare_at_price",
            "category", "image", "thumbnail", "in_stock", "badges",
        ]

    def get_image(self, obj):
        return obj.image.url if obj.image else None

    def get_thumbnail(self, obj):
        return obj.thumbnail.url if obj.thumbnail else self.get_image(obj)

    def get_in_stock(self, obj):
        return not obj.is_sold_out

    def get_badges(self, obj):
        badges = []
        if obj.is_sold_out:
            badges.append("sold_out")
        elif obj.is_low_stock:
            badges.append("low_stock")
        if obj.is_on_sale:
            badges.append("sale")
        if obj.is_new:
            badges.append("new")
        return badges




class ProductDetailSerializer(ProductListSerializer):
    """Everything the product page needs: full info + its number + suggestions."""

    position = serializers.SerializerMethodField()
    related = serializers.SerializerMethodField()

    class Meta(ProductListSerializer.Meta):
        fields = ProductListSerializer.Meta.fields + [
            "description", "stock", "created_at", "position", "related",
        ]

    def get_position(self, obj):
        number, total = product_position(obj)
        return {"number": number, "total": total}

    def get_related(self, obj):
        # Suggestions use the small "list" format (no description, no suggestions of suggestions)
        return ProductListSerializer(related_products(obj), many=True, context=self.context).data
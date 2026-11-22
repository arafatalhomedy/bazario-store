"""
Order serializers: the gatekeepers between the website and the database.

CheckoutSerializer   checks the details the customer sends (coming IN)
OrderSerializer      a saved order as JSON for the Done / Track pages (going OUT)
"""
import re

from rest_framework import serializers

from .models import Order, OrderItem

PHONE_CHARACTERS = re.compile(r"^[0-9+()\-\s]+$")   # digits, spaces, + - ( )
PHONE_MIN_DIGITS = 7
PHONE_MAX_DIGITS = 15


# ---------------------------------------------------------------- coming IN
class CheckoutSerializer(serializers.Serializer):
    full_name = serializers.CharField(
        min_length=2, max_length=100,
        error_messages={"blank": "Enter your full name.", "min_length": "Enter your full name."},
    )
    phone = serializers.CharField(
        max_length=20,
        error_messages={"blank": "Enter your phone number."},
    )
    city = serializers.CharField(
        min_length=2, max_length=80,
        error_messages={"blank": "Enter your city.", "min_length": "Enter your city."},
    )
    street = serializers.CharField(
        min_length=5, max_length=200,
        error_messages={"blank": "Add the street and building.", "min_length": "Add the street and building."},
    )
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")

    def validate_phone(self, value):
        digits = re.sub(r"\D", "", value)
        if not PHONE_CHARACTERS.match(value) or not PHONE_MIN_DIGITS <= len(digits) <= PHONE_MAX_DIGITS:
            raise serializers.ValidationError("Enter a real phone number.")
        return value


# ---------------------------------------------------------------- going OUT
class OrderItemSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    image = serializers.SerializerMethodField()
    slug = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = ["product_name", "unit_price", "quantity", "line_total", "image", "slug"]

    # The live product may be gone one day: then there is no photo or link
    def get_image(self, obj):
        product = obj.product
        if product is None:
            return None
        photo = product.thumbnail or product.image
        return photo.url if photo else None

    def get_slug(self, obj):
        return obj.product.slug if obj.product else None


class OrderSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    payment_label = serializers.CharField(source="get_payment_method_display", read_only=True)
    items = OrderItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(read_only=True)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Order
        fields = [
            "number", "status", "status_label", "payment_method", "payment_label",
            "full_name", "city", "street", "note", "created_at",
            "items", "item_count", "subtotal", "total",
        ]
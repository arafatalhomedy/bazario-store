"""
Basket serializers.
Incoming: check what the website sends (product id, quantity).
Outgoing: turn the basket summary into JSON for the basket page.
"""
from rest_framework import serializers

from apps.products.serializers import ProductListSerializer

from .services import MAX_QUANTITY


# ---------------------------------------------------------------- incoming
class AddItemSerializer(serializers.Serializer):
    """POST /api/cart/items/  {"product_id": 4, "quantity": 1}"""

    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=MAX_QUANTITY, default=1)


class UpdateItemSerializer(serializers.Serializer):
    """PATCH /api/cart/items/<product_id>/  {"quantity": 3}"""

    quantity = serializers.IntegerField(min_value=1, max_value=MAX_QUANTITY)


# ---------------------------------------------------------------- outgoing
class CartLineSerializer(serializers.Serializer):
    product = ProductListSerializer()
    quantity = serializers.IntegerField()
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    max_quantity = serializers.SerializerMethodField()

    def get_max_quantity(self, line):
        """How high the + button may go (the server checks again anyway)."""
        return min(line["product"].stock, MAX_QUANTITY)


class CartSerializer(serializers.Serializer):
    items = CartLineSerializer(source="lines", many=True)
    total_quantity = serializers.IntegerField()
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2)
    total = serializers.DecimalField(max_digits=12, decimal_places=2)
    notices = serializers.ListField(child=serializers.CharField())
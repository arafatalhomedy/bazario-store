"""
Basket API.

GET    /api/cart/                    show the basket
DELETE /api/cart/                    empty the basket
POST   /api/cart/items/              add a product      {"product_id": 4, "quantity": 1}
PATCH  /api/cart/items/<product_id>/ change a quantity  {"quantity": 3}
DELETE /api/cart/items/<product_id>/ remove a product

Every answer is the full, updated basket (or {"detail": "..."} on an error).
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .permissions import CsrfProtected
from .serializers import AddItemSerializer, CartSerializer, UpdateItemSerializer
from .services import Cart, CartError


class CartBaseView(APIView):
    """Shared settings for every basket door."""

    permission_classes = [CsrfProtected]   # 🔒 CSRF check for guests too
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "cart"                # speed limit (see settings: "cart")

    def cart_response(self, cart, status_code=status.HTTP_200_OK):
        return Response(CartSerializer(cart.summary()).data, status=status_code)

    def error_response(self, error):
        return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)


class CartView(CartBaseView):
    def get(self, request):
        return self.cart_response(Cart(request))

    def delete(self, request):
        cart = Cart(request)
        cart.clear()
        return self.cart_response(cart)


class CartItemsView(CartBaseView):
    def post(self, request):
        incoming = AddItemSerializer(data=request.data)
        incoming.is_valid(raise_exception=True)   # wrong data → 400 with details

        cart = Cart(request)
        try:
            cart.add(**incoming.validated_data)   # product_id, quantity
        except CartError as error:
            return self.error_response(error)
        return self.cart_response(cart, status.HTTP_201_CREATED)


class CartItemView(CartBaseView):
    def patch(self, request, product_id):
        incoming = UpdateItemSerializer(data=request.data)
        incoming.is_valid(raise_exception=True)

        cart = Cart(request)
        try:
            cart.update(product_id, incoming.validated_data["quantity"])
        except CartError as error:
            return self.error_response(error)
        return self.cart_response(cart)

    def delete(self, request, product_id):
        cart = Cart(request)
        cart.remove(product_id)
        return self.cart_response(cart)
"""
Order API.

POST /api/orders/            place an order from the basket
POST /api/orders/track/      find an order by number + phone (Track order)
GET  /api/orders/<number>/   the order just placed (Done page), owner only
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.cart.permissions import CsrfProtected

from .models import Order
from .serializers import CheckoutSerializer, OrderSerializer
from .services import OrderError, find_order, place_order
from rest_framework.permissions import IsAuthenticated
SESSION_ORDERS = "orders"   # numbers of the orders placed in this browser
REMEMBER_ORDERS = 20        # keep only the latest ones
NOT_FOUND = "We couldn't find an order with that number and phone number."


class OrderCreateView(APIView):
    """POST: turn the basket into an order."""

    permission_classes = [IsAuthenticated, CsrfProtected]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "orders"

    def post(self, request):
        details = CheckoutSerializer(data=request.data)
        details.is_valid(raise_exception=True)   # 400 with a message per field

        try:
            order = place_order(request, details.validated_data)
        except OrderError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        remember_order(request, order.number)
        order = Order.objects.prefetch_related("items__product").get(pk=order.pk)
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderTrackView(APIView):
    """POST {number, phone}: the order, only if both match."""

    permission_classes = [CsrfProtected]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "track"

    def post(self, request):
        order = find_order(request.data.get("number"), request.data.get("phone"))
        if order is None:
            # Same answer for a wrong number OR a wrong phone: nothing to guess from
            return Response({"detail": NOT_FOUND}, status=status.HTTP_404_NOT_FOUND)
        remember_order(request, order.number)   # it now shows in "Your orders"
        return Response(OrderSerializer(order).data)


class OrderDetailView(APIView):
    """GET: the order just placed, for the Done page. Owner only."""

    def get(self, request, number):
        order = (
            Order.objects.filter(number__iexact=number)
            .prefetch_related("items__product")
            .first()
        )
        if order is None or not can_see(request, order):
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(OrderSerializer(order).data)


# ---------------------------------------------------------------- helpers
def remember_order(request, number):
    """Remember this order in the visitor's session (so the Done page can show it)."""
    numbers = [n for n in request.session.get(SESSION_ORDERS, []) if n != number]
    request.session[SESSION_ORDERS] = (numbers + [number])[-REMEMBER_ORDERS:]


def can_see(request, order):
    """Placed in this browser, or belongs to the logged-in customer."""
    if order.number in request.session.get(SESSION_ORDERS, []):
        return True
    return request.user.is_authenticated and order.user_id == request.user.id
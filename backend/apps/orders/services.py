"""
Order processing: turns the basket into a saved order, safely.

place_order()  basket → Order + OrderItems, stock lowered, basket emptied
find_order()   for "Track order": needs the order number AND the phone number

Safety:
- Prices and stock always come from the database, never from the browser.
- Everything happens in ONE transaction: if any step fails, nothing is saved.
- Product rows are locked while ordering (PostgreSQL), and stock is lowered
  with "only if there is still enough", so two customers can never buy the
  same last item and stock can never go below 0.
"""
import re

from django.db import transaction
from django.db.models import F

from apps.cart.services import Cart
from apps.products.models import Product

from .models import Order, OrderItem, OrderStatusEvent


class OrderError(Exception):
    """An order that can't be placed. The message is shown to the customer."""


def place_order(request, details):
    """
    Place an order from the visitor's basket.

    details = {"full_name", "phone", "city", "street", "note"} (already checked
    by the serializer). Returns the saved Order, or raises OrderError.
    """
    cart = Cart(request)
    summary = cart.summary()   # fresh from the database

    if not summary["lines"]:
        raise OrderError("Your basket is empty.")
    if summary["notices"]:
        # Something sold out or a quantity was lowered: the customer must see it first
        raise OrderError(" ".join(summary["notices"]) + " Please check your basket.")

    user = request.user if request.user.is_authenticated else None
    order = _save_order(summary["lines"], details, user)

    cart.clear()   # only after the order was saved
    return order


@transaction.atomic
def _save_order(lines, details, user):
    """All or nothing: any OrderError raised here undoes every change."""
    ids = [line["product"].id for line in lines]

    # Lock these product rows until the order is saved (PostgreSQL; SQLite
    # already lets only one write happen at a time)
    products = {
        product.id: product
        for product in Product.objects.select_for_update().filter(pk__in=ids, is_active=True)
    }

    order = Order.objects.create(user=user, **details)
    items = []

    for line in lines:
        seen = line["product"]          # what the customer saw in the basket
        quantity = line["quantity"]
        product = products.get(seen.id) # the locked, fresh row

        if product is None:
            raise OrderError(f"{seen.name} is no longer available. Please check your basket.")
        if product.price != seen.price:
            raise OrderError(f"The price of {product.name} just changed. Please check your basket.")

        # Lower the stock ONLY if there is still enough (one safe database step)
        lowered = Product.objects.filter(pk=product.pk, stock__gte=quantity).update(
            stock=F("stock") - quantity,
        )
        if not lowered:
            raise OrderError(f"Sorry, {product.name} just sold out or has fewer items left. Please check your basket.")

        items.append(OrderItem(
            order=order,
            product=product,
            product_name=product.name,   # copied: a fact about this sale
            unit_price=product.price,    # copied: the price actually paid
            quantity=quantity,
        ))

    OrderItem.objects.bulk_create(items)
    OrderStatusEvent.objects.create(order=order, status=order.status)   # history: "Received"
    return order


def find_order(number, phone):
    """
    The order with this number, but ONLY if the phone number matches too,
    so nobody can look up a stranger's order. Returns None otherwise.
    """
    order = (
        Order.objects.filter(number__iexact=(number or "").strip())
        .prefetch_related("items")
        .first()
    )
    if order and _digits(order.phone) == _digits(phone):
        return order
    return None


def _digits(value):
    """'0791 234-567' → '0791234567' (spaces and dashes don't matter)."""
    return re.sub(r"\D", "", value or "")

JOURNEY = [
    Order.Status.PENDING,
    Order.Status.CONFIRMED,
    Order.Status.SHIPPED,
    Order.Status.DELIVERED,
]


@transaction.atomic
def set_status(order, status):
    """
    The ONLY way to change an order's status. In one transaction it:
    - refuses to reopen a cancelled order
    - returns the products to stock when cancelling
    - saves the new status AND writes its history row (with the time)
    """
    order.refresh_from_db(
        fields=["status"], from_queryset=Order.objects.select_for_update(),
    )
    if order.status == status:
        return
    if order.status == Order.Status.CANCELLED:
        raise OrderError(f"{order.number} is cancelled and can't be reopened.")

    if status == Order.Status.CANCELLED:
        for item in order.items.all():
            if item.product_id:   # the product may have been deleted since
                Product.objects.filter(pk=item.product_id).update(stock=F("stock") + item.quantity)

    order.status = status
    order.save(update_fields=["status", "updated_at"])
    OrderStatusEvent.objects.create(order=order, status=status)


def cancel_order(order):
    """Cancel an order and put its products back into stock."""
    set_status(order, Order.Status.CANCELLED)


def timeline(order):
    """
    The 4 journey stops for the details page, each with the time it was
    reached (None = not yet, or not recorded for older orders).
    """
    reached = {}
    for event in order.events.all():
        reached.setdefault(event.status, event.created_at)   # the FIRST time it was reached
    reached.setdefault(Order.Status.PENDING, order.created_at)  # older orders without history

    current = JOURNEY.index(order.status) if order.status in JOURNEY else -1
    return [
        {
            "status": status,
            "label": Order.Status(status).label,
            "time": reached.get(status),
            "done": index < current,
            "current": index == current,
            "state": "done" if index < current else "current" if index == current else "next",
            "at": ("0", "0.33", "0.67", "1")[index],   # place along the road
        }
        for index, status in enumerate(JOURNEY)
    ]
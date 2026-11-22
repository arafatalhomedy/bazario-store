from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import Order, OrderCancellationRequest
from .services import OrderError, cancel_order


@transaction.atomic
def request_cancellation(order, buyer):
    # Make the first query a write to serialize with dispatch on SQLite as well.
    confirmed = Order.objects.filter(pk=order.pk, user=buyer, status=Order.Status.CONFIRMED)
    if not confirmed.update(status=F("status")):
        raise OrderError("The order has changed. Cancellation requests close when dispatch begins.")
    _, created = OrderCancellationRequest.objects.get_or_create(order=order)
    return created


@transaction.atomic
def decide_cancellation(order, reviewer, decision, *, decline_reason=""):
    if decision not in (OrderCancellationRequest.Decision.APPROVED, OrderCancellationRequest.Decision.DECLINED):
        raise ValueError("Unknown cancellation decision")
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.status != Order.Status.CONFIRMED:
        raise OrderError("This order is no longer awaiting a cancellation decision.")
    pending = OrderCancellationRequest.objects.filter(order=order, decision=OrderCancellationRequest.Decision.PENDING)
    reason = ""
    if decision == OrderCancellationRequest.Decision.DECLINED:
        reason = decline_reason.strip()
        if not reason:
            raise OrderError("Enter a reason for the customer before declining the request.")
        if len(reason) > 500:
            raise OrderError("Keep the reason to 500 characters or fewer.")
    if not pending.update(decision=decision, reviewed_by=reviewer, reviewed_at=timezone.now(), decline_reason=reason):
        raise OrderError("There is no open cancellation request for this order.")
    if decision == OrderCancellationRequest.Decision.APPROVED:
        cancel_order(order)

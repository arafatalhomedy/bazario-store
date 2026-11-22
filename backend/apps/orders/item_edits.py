from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.products.models import Product
from .models import Order, OrderItemChange
from .services import OrderError


@transaction.atomic
def reduce_pending_items(order, buyer, version, quantities):
    """Commit one buyer edit, using the saved unit prices and quantities."""
    changed_message = "This order changed. Review its latest items and status before editing again."
    if order.updated_at.isoformat() != version:
        raise OrderError(changed_message)

    now = timezone.now()
    claimed = Order.objects.filter(
        pk=order.pk, user=buyer, status=Order.Status.PENDING, updated_at=order.updated_at,
    ).update(updated_at=now)
    if not claimed:
        raise OrderError(changed_message)

    # Fetch fresh rows after claiming the order, bypassing any page prefetch.
    lines = list(order.items.order_by("product_id", "pk"))
    if quantities.keys() != {str(line.pk) for line in lines}:
        raise OrderError(changed_message)

    changes = []
    kept_units = 0
    for line in lines:
        keep = quantities[str(line.pk)]
        if not 0 <= keep <= line.quantity:
            raise OrderError("Choose a quantity between zero and the quantity ordered.")
        kept_units += keep
        if keep < line.quantity:
            changes.append((line, keep))
    if not kept_units:
        raise OrderError("To remove every item, use Cancel order.")
    if not changes:
        raise OrderError("No item quantities were changed.")

    for line, keep in changes:
        removed = line.quantity - keep
        OrderItemChange.objects.create(
            order=order, product_name=line.product_name, unit_price=line.unit_price,
            quantity_before=line.quantity, quantity_after=keep, created_at=now,
        )
        if line.product_id:
            Product.objects.filter(pk=line.product_id).update(stock=F("stock") + removed)
        if keep:
            line.quantity = keep
            line.save(update_fields=["quantity"])
        else:
            line.delete()

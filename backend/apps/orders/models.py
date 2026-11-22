"""
Orders: what a customer bought, where it goes, and where it is now.
The tables are in Third Normal Form (3NF):

Order      one order: delivery details, payment method, status
OrderItem  one product inside an order (the junction between Order and Product)

- Name and price are COPIED into OrderItem at the moment of buying. They are
  facts about THIS sale, so later price changes never change old orders.
- Totals are NOT stored: they are calculated from the items, so they can
  never disagree with them.
"""
import secrets
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

NUMBER_PREFIX = "BZ-"


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"
        SHIPPED = "shipped", "On the way"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    class PaymentMethod(models.TextChoices):
        CASH_ON_DELIVERY = "cod", "Cash on delivery"

    # A random public number like BZ-482173 (not 1, 2, 3… so it can't be guessed)
    number = models.CharField(max_length=12, unique=True, editable=False)

    # Empty for guests. Filled for logged-in customers (accounts come on Day 4)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orders",
    )

    # Where THIS order goes (kept even if the customer moves later)
    full_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20)
    city = models.CharField(max_length=80)
    street = models.CharField(max_length=200)
    note = models.CharField(max_length=300, blank=True)

    payment_method = models.CharField(
        max_length=10,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH_ON_DELIVERY,
    )
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )

    estimated_delivery_start = models.DateField(null=True, blank=True)
    estimated_delivery_end = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]   # newest first

    def __str__(self):
        return self.number

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = self._unique_number()
        super().save(*args, **kwargs)

    @staticmethod
    def _unique_number():
        """BZ- plus 6 random digits, tried until it isn't used yet."""
        while True:
            number = f"{NUMBER_PREFIX}{secrets.randbelow(900_000) + 100_000}"
            if not Order.objects.filter(number=number).exists():
                return number

    # ----------------------------------------------------------- calculated (not stored)
    @property
    def subtotal(self):
        return sum((item.line_total for item in self.items.all()), Decimal("0.00"))

    @property
    def total(self):
        # No delivery fee yet. If one is added later, it becomes a real column
        # (delivery_fee) and total = subtotal + delivery_fee.
        return self.subtotal

    @property
    def initials(self):
        """'Arafat Ali' → 'AA' (for the address badge)."""
        parts = self.full_name.split()
        return "".join(part[0] for part in parts[:2]).upper()

    @property
    def item_count(self):
        return sum(item.quantity for item in self.items.all())


class OrderCancellationRequest(models.Model):
    class Decision(models.TextChoices):
        PENDING = "pending", "Awaiting review"
        APPROVED = "approved", "Approved"
        DECLINED = "declined", "Declined"

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="cancellation_request")
    decision = models.CharField(max_length=10, choices=Decision.choices, default=Decision.PENDING)
    decline_reason = models.CharField(max_length=500, blank=True, default="")
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")

    # The live product (becomes empty if the product is deleted one day;
    # the order keeps its copied name and price)
    product = models.ForeignKey(
        "products.Product",
        null=True,
        on_delete=models.SET_NULL,
        related_name="order_items",
    )

    # Facts about THIS sale, copied at the moment of buying
    product_name = models.CharField(max_length=200)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])

    class Meta:
        ordering = ["id"]
        constraints = [
            # The same product only once per order (its quantity goes up instead)
            models.UniqueConstraint(fields=["order", "product"], name="unique_product_per_order"),
            models.CheckConstraint(condition=Q(quantity__gte=1), name="order_item_quantity_at_least_1"),
            models.CheckConstraint(condition=Q(unit_price__gte=0), name="order_item_price_not_negative"),
        ]

    def __str__(self):
        return f"{self.quantity} × {self.product_name}"

    @property
    def line_total(self):
        """Calculated, never stored: unit price × quantity."""
        return self.unit_price * self.quantity

class OrderStatusEvent(models.Model):
    """
    The order's history: one row each time its status changes.
    Used by the journey on the details page ("Confirmed · 21 Nov, 16:40").
    Rows are only written by services.set_status(), never by hand.
    """

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="events")
    status = models.CharField(max_length=12, choices=Order.Status.choices)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at", "id"]   # oldest first, like a timeline
        indexes = [models.Index(fields=["order", "created_at"])]

    def __str__(self):
        return f"{self.order} → {self.get_status_display()}"


class OrderItemChange(models.Model):
    """A buyer's reduction, including the original price for removed lines."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="item_changes")
    product_name = models.CharField(max_length=200)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity_before = models.PositiveIntegerField()
    quantity_after = models.PositiveIntegerField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at", "id"]

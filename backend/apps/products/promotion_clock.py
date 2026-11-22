from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from .models import Product


def apply_due_promotions():
    now = timezone.now()
    due = Product.objects.filter(Q(promotion_ends__lte=now) | Q(promotion_starts__lte=now, queued_price__isnull=False))
    if not due.exists():
        return
    clear = dict(promotion_starts=None, promotion_ends=None, queued_price=None, updated_at=now)
    with transaction.atomic():
        expired = Product.objects.filter(promotion_ends__lte=now)
        # A whole window may have passed while the store was idle.
        expired.filter(queued_price__isnull=False).update(**clear)
        expired.filter(queued_price__isnull=True, compare_at_price__isnull=False).update(
            price=F("compare_at_price"), compare_at_price=None, **clear,
        )
        Product.objects.filter(promotion_starts__lte=now, promotion_ends__gt=now, queued_price__isnull=False).update(
            compare_at_price=F("price"), price=F("queued_price"), queued_price=None, updated_at=now,
        )


class PromotionClockMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        apply_due_promotions()
        return self.get_response(request)

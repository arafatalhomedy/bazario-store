from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from apps.products.models import Category, Product
from .models import Order, OrderItem
from .services import cancel_order, set_status


class CustomerItemEditTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.buyer = get_user_model().objects.create_user(username="buyer@example.test")
        category = Category.objects.create(name="Audio")
        cls.product = Product.objects.create(category=category, name="Speaker", price=65, stock=7)
        cls.order = Order.objects.create(user=cls.buyer, full_name="Sample Buyer", city="George Town")
        cls.speakers = OrderItem.objects.create(
            order=cls.order, product=cls.product, product_name="Speaker", unit_price=59, quantity=3,
        )
        cls.other = OrderItem.objects.create(
            order=cls.order, product_name="Discontinued item", unit_price=36, quantity=1,
        )

    def setUp(self):
        self.client.force_login(self.buyer)
        self.url = reverse("order-page", kwargs={"number": self.order.number})
        self.data = {
            "action": "edit_items", "version": self.order.updated_at.isoformat(),
            f"keep_{self.speakers.pk}": 1, f"keep_{self.other.pk}": 0,
        }

    def test_reduction_and_retry_then_full_cancellation(self):
        self.assertRedirects(self.client.post(self.url, self.data), self.url, fetch_redirect_response=False)
        self.client.post(self.url, self.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 9)
        self.assertEqual(self.order.total, Decimal("59.00"))
        self.assertFalse(self.order.items.filter(pk=self.other.pk).exists())
        self.assertEqual(self.order.item_changes.count(), 2)
        cancel_order(self.order)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

    def test_last_item_and_quantity_increase_are_rejected(self):
        for count in (0, 4):
            self.client.post(self.url, {**self.data, f"keep_{self.speakers.pk}": count})
        self.order.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(self.order.item_count, 4)
        self.assertEqual(self.product.stock, 7)
        self.assertFalse(self.order.item_changes.exists())

    def test_confirmed_order_rejects_existing_edit_form(self):
        set_status(self.order, Order.Status.CONFIRMED)
        self.client.post(self.url, self.data)
        self.assertEqual(self.order.item_count, 4)
        self.assertFalse(self.order.item_changes.exists())

    def test_tracking_access_does_not_grant_edit_permission(self):
        self.client.logout()
        session = self.client.session
        session["orders"] = [self.order.number]
        session.save()
        self.assertEqual(self.client.post(self.url, self.data).status_code, 404)
        self.assertEqual(self.order.item_count, 4)

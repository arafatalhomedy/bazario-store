from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from apps.products.models import Category, Product
from .models import Order, OrderCancellationRequest, OrderItem
from .views import SESSION_ORDERS


class ConfirmedCancellationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        users = get_user_model().objects
        cls.buyer = users.create_user(username="buyer@example.test", email="buyer@example.test")
        cls.other = users.create_user(username="other@example.test", email="other@example.test")
        cls.staff = users.create_superuser(username="staff@example.test", email="staff@example.test", password=None)
        cls.order = Order.objects.create(user=cls.buyer, status=Order.Status.CONFIRMED,
                                         full_name="Buyer", phone="0123456789", street="10 Test Street", city="Test City")
        cls.product = Product.objects.create(category=Category.objects.create(name="Audio"),
                                             name="Speaker", price=25, stock=3)
        OrderItem.objects.create(order=cls.order, product=cls.product, product_name="Speaker", unit_price=25, quantity=2)

    def setUp(self):
        self.page = reverse("order-page", args=[self.order.number])
        self.review = reverse("admin:orders_order_review_action", args=[self.order.pk])

    def submit_request(self):
        self.client.force_login(self.buyer)
        return self.client.post(self.page, {"action": "request_cancellation"})

    def review_action(self, action, **fields):
        self.client.force_login(self.staff)
        return self.client.post(self.review, {"action": action, **fields})

    def assert_order(self, status, stock):
        self.order.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(self.order.status, status)
        self.assertEqual(self.product.stock, stock)

    def test_request_survives_reload_and_blocks_stale_dispatch(self):
        self.assertEqual(self.submit_request().status_code, 302)
        self.submit_request()
        self.assertContains(self.client.get(self.page), "Dispatch is paused")
        self.assertEqual(self.review_action("shipped").status_code, 302)
        self.assert_order(Order.Status.CONFIRMED, 3)
        self.assertEqual(OrderCancellationRequest.objects.get().decision, "pending")
        self.assertFalse(self.order.events.exists())

    def test_approval_restores_stock_once_even_after_replay(self):
        self.submit_request()
        self.review_action("approve_cancellation")
        self.review_action("approve_cancellation")
        self.review_action("decline_cancellation")
        self.assert_order(Order.Status.CANCELLED, 5)
        self.assertEqual(self.order.events.filter(status=Order.Status.CANCELLED).count(), 1)
        request = OrderCancellationRequest.objects.get()
        self.assertEqual(request.reviewed_by, self.staff)
        self.assertIsNotNone(request.reviewed_at)
        self.assertEqual(request.decision, "approved")

    def test_decline_allows_dispatch_and_keeps_decision(self):
        self.submit_request()
        reason = "Your custom engraving is complete."
        self.review_action("decline_cancellation", decline_reason=f"  {reason}  ")
        self.review_action("decline_cancellation", decline_reason="Replacement message")
        self.submit_request()
        page = self.client.get(self.page)
        self.assertContains(page, "Your cancellation request was declined")
        self.assertContains(page, reason)
        self.assertEqual(OrderCancellationRequest.objects.get().decline_reason, reason)
        self.assert_order(Order.Status.CONFIRMED, 3)
        self.review_action("shipped")
        self.assert_order(Order.Status.SHIPPED, 3)
        self.assertEqual(OrderCancellationRequest.objects.get().decision, "declined")

    def test_dispatch_first_closes_request_window(self):
        self.review_action("shipped")
        self.submit_request()
        self.assert_order(Order.Status.SHIPPED, 3)
        self.assertFalse(OrderCancellationRequest.objects.exists())

    def test_decline_requires_a_nonblank_reason_within_the_limit(self):
        self.submit_request()
        for fields in ({}, {"decline_reason": "   "}, {"decline_reason": "a" * 501}):
            with self.subTest(fields=fields):
                self.review_action("decline_cancellation", **fields)
                request = OrderCancellationRequest.objects.get()
                self.assertEqual(request.decision, "pending")
                self.assertIsNone(request.reviewed_at)
                self.assertEqual(request.decline_reason, "")
        self.review_action("decline_cancellation", decline_reason="a" * 500)
        self.assertEqual(OrderCancellationRequest.objects.get().decision, "declined")

    def test_reason_is_plain_text_visible_only_to_the_buyer_on_storefront(self):
        self.submit_request()
        self.review_action("decline_cancellation", decline_reason="Engraving: <sample>")
        self.client.force_login(self.buyer)
        self.assertContains(self.client.get(self.page), "Engraving: &lt;sample&gt;")
        self.client.force_login(self.other)
        session = self.client.session
        session[SESSION_ORDERS] = [self.order.number]
        session.save()
        self.assertNotContains(self.client.get(self.page), "Engraving:")

    def test_tracking_access_does_not_grant_permission_to_request(self):
        self.client.force_login(self.other)
        session = self.client.session
        session[SESSION_ORDERS] = [self.order.number]
        session.save()
        self.assertNotContains(self.client.get(self.page), "Send request")
        self.assertEqual(self.client.post(self.page, {"action": "request_cancellation"}).status_code, 404)
        self.assertFalse(OrderCancellationRequest.objects.exists())

from decimal import Decimal

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.messages.storage.fallback import FallbackStorage
from django.test import RequestFactory, TestCase

from apps.products.models import Category, Product

from .admin import OrderAdmin
from .models import Order, OrderItem
from .services import OrderError, cancel_order, set_status


class OrderStatusTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        category = Category.objects.create(name="Audio")
        cls.product = Product.objects.create(
            category=category, name="Speaker", price=Decimal("25.00"), stock=3,
        )
        cls.order = Order.objects.create(
            full_name="Test Customer", phone="0123456789",
            city="Test City", street="123 Test Street",
        )
        OrderItem.objects.create(
            order=cls.order, product=cls.product, product_name=cls.product.name,
            unit_price=cls.product.price, quantity=2,
        )

    def test_cancelling_two_loaded_copies_restores_stock_once(self):
        stale_order = Order.objects.get(pk=self.order.pk)

        cancel_order(self.order)
        cancel_order(stale_order)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 5)
        self.assertEqual(stale_order.status, Order.Status.CANCELLED)
        self.assertEqual(
            list(self.order.events.values_list("status", flat=True)),
            [Order.Status.CANCELLED],
        )

    def test_stale_copy_cannot_reopen_cancelled_order(self):
        stale_order = Order.objects.get(pk=self.order.pk)
        cancel_order(self.order)

        with self.assertRaises(OrderError):
            set_status(stale_order, Order.Status.CONFIRMED)

        self.order.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.CANCELLED)
        self.assertEqual(self.product.stock, 5)
        self.assertEqual(self.order.events.count(), 1)

    def test_same_transition_through_stale_copy_records_one_event(self):
        stale_order = Order.objects.get(pk=self.order.pk)

        set_status(self.order, Order.Status.CONFIRMED)
        set_status(stale_order, Order.Status.CONFIRMED)

        self.assertEqual(stale_order.status, Order.Status.CONFIRMED)
        self.assertEqual(self.order.events.count(), 1)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 3)

    def test_stale_status_does_not_hide_a_requested_transition(self):
        stale_order = Order.objects.get(pk=self.order.pk)
        set_status(self.order, Order.Status.CONFIRMED)

        set_status(stale_order, Order.Status.PENDING)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PENDING)
        self.assertEqual(
            list(self.order.events.values_list("status", flat=True)),
            [Order.Status.CONFIRMED, Order.Status.PENDING],
        )


class OrderAdminStatusTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_superuser(
            username="admin@example.test", email="admin@example.test", password=None,
        )
        cls.order = Order.objects.create(
            full_name="Test Customer", phone="0123456789",
            city="Test City", street="123 Test Street",
        )

    def setUp(self):
        self.request = RequestFactory().post("/manage-store/")
        self.request.user = self.staff
        self.request.session = {}
        self.request._messages = FallbackStorage(self.request)
        self.model_admin = OrderAdmin(Order, admin.site)

    def saved_form(self, status):
        stale_order = Order.objects.get(pk=self.order.pk)
        form_class = self.model_admin.get_form(self.request, stale_order)
        form = form_class(data={
            "status": status, "full_name": "Updated Customer", "phone": "0123456789",
            "city": "Test City", "street": "123 Test Street", "note": "",
        }, instance=stale_order)
        self.assertTrue(form.is_valid(), form.errors)
        return form

    def test_stale_admin_status_edit_cannot_reopen_cancelled_order(self):
        form = self.saved_form(Order.Status.CONFIRMED)
        cancel_order(self.order)

        self.model_admin.save_model(self.request, form.instance, form, change=True)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.CANCELLED)
        self.assertEqual(self.order.events.count(), 1)

    def test_stale_admin_customer_edit_preserves_cancelled_status(self):
        form = self.saved_form(Order.Status.PENDING)
        cancel_order(self.order)

        self.model_admin.save_model(self.request, form.instance, form, change=True)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.CANCELLED)
        self.assertEqual(self.order.full_name, "Updated Customer")
        self.assertEqual(self.order.events.count(), 1)

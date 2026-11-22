from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from apps.products.models import Category, Product

from .models import Order


class CheckoutTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.customer = get_user_model().objects.create_user(username="checkout-test")
        cls.product = Product.objects.create(
            category=Category.objects.create(name="Audio"),
            name="Speaker",
            price=Decimal("25.00"),
            stock=5,
        )

    def setUp(self):
        self.browser = Client(enforce_csrf_checks=True)
        self.browser.force_login(self.customer)
        self.assertEqual(self.browser.get(reverse("checkout-page")).status_code, 200)
        self.csrf = self.browser.cookies["csrftoken"].value
        response = self.post_json("cart-items", {"product_id": self.product.pk, "quantity": 2})
        self.assertEqual(response.status_code, 201, response.content)

    def post_json(self, url_name, data):
        return self.browser.post(
            reverse(url_name), data, content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf,
        )

    def place_order(self, **overrides):
        details = {
            "full_name": "Test Customer",
            "phone": "0123456789",
            "city": "Test City",
            "street": "123 Test Street",
        }
        details.update(overrides)
        return self.post_json("order-create", details)

    def test_checkout_creates_order_and_clears_basket(self):
        response = self.place_order()
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["total"], "50.00")

        order = Order.objects.get(number=response.json()["number"])
        self.assertEqual(order.user_id, self.customer.pk)
        self.assertEqual(order.items.get().quantity, 2)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 3)
        self.assertEqual(self.browser.get(reverse("cart")).json()["items"], [])
        receipt = self.browser.get(reverse("order-done-page", args=[order.number]))
        self.assertEqual(receipt.status_code, 200)

    def test_invalid_phone_keeps_basket_and_stock(self):
        response = self.place_order(phone="123")
        self.assertEqual(response.status_code, 400)
        self.assertIn("phone", response.json())
        self.assertFalse(Order.objects.exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 5)
        self.assertEqual(self.browser.get(reverse("cart")).json()["total_quantity"], 2)

    def test_stock_drop_requires_customer_to_review_basket(self):
        Product.objects.filter(pk=self.product.pk).update(stock=1)

        response = self.place_order()

        self.assertEqual(response.status_code, 400)
        self.assertIn("Please check your basket", response.json()["detail"])
        self.assertFalse(Order.objects.exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 1)
        self.assertEqual(self.browser.get(reverse("cart")).json()["total_quantity"], 1)

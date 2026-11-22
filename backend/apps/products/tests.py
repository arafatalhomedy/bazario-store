from decimal import Decimal

from django.test import TestCase
from django.urls import reverse

from .models import Category, Product


class ProductApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        audio = Category.objects.create(name="Audio")
        home = Category.objects.create(name="Home")
        Product.objects.create(category=audio, name="Speaker", price=Decimal("50.00"), stock=3)
        Product.objects.create(category=home, name="Lamp", price=Decimal("20.00"), stock=0)
        Product.objects.create(category=home, name="Hidden Vase", price=Decimal("10.00"),
                               stock=5, is_active=False)

    def get_results(self, **params):
        response = self.client.get(reverse("product-list"), params)
        self.assertEqual(response.status_code, 200)
        return response.json()["results"]

    def get_names(self, **params):
        return [p["name"] for p in self.get_results(**params)]

    def test_hidden_products_are_not_listed(self):
        self.assertNotIn("Hidden Vase", self.get_names())

    def test_search(self):
        self.assertEqual(self.get_names(search="speak"), ["Speaker"])

    def test_category_filter(self):
        self.assertEqual(self.get_names(category="home"), ["Lamp"])

    def test_sort_by_price(self):
        self.assertEqual(self.get_names(sort="price_asc"), ["Lamp", "Speaker"])

    def test_badges(self):
        badges = {p["name"]: p["badges"] for p in self.get_results()}
        self.assertIn("sold_out", badges["Lamp"])
        self.assertIn("low_stock", badges["Speaker"])

    def test_categories_endpoint_hides_empty_categories(self):
        Category.objects.create(name="Empty")
        response = self.client.get(reverse("category-list"))
        names = [c["name"] for c in response.json()]
        self.assertEqual(names, ["Audio", "Home"])

    def test_storefront_category_list_includes_empty_in_alphabetical_order(self):
        new_category = Category.objects.create(name="decor")
        Product.objects.create(
            category=new_category, name="Hidden Decor", price=Decimal("10.00"), is_active=False,
        )
        response = self.client.get(reverse("category-list"), {"include_empty": "1"})
        self.assertEqual(response.status_code, 200)
        categories = response.json()
        self.assertEqual([category["name"] for category in categories], ["Audio", "decor", "Home"])
        self.assertEqual([category["product_count"] for category in categories], [1, 0, 1])
        self.assertIsNone(categories[1]["image"])

    def test_empty_category_has_shop_section_and_detail_page(self):
        Category.objects.create(name="Decor")
        shop = reverse("shop-page")
        self.assertContains(self.client.get(shop), 'id="category-decor"')

        response = self.client.get(shop, {"category": "decor"})
        self.assertContains(response, "No products in this category yet.")
        self.assertEqual(response.context["product_count"], 0)

"""
Basket logic. The basket lives in the visitor's session:

    request.session["cart"] = {"<product id>": <quantity>, ...}

Only ids and quantities are stored. Prices, names and stock always come from
the database, so nobody can change a price in their browser.
"""
from decimal import Decimal

from apps.products.services import visible_products

SESSION_KEY = "cart"
MAX_QUANTITY = 99   # most of one product a customer can put in the basket


class CartError(Exception):
    """A basket change that isn't allowed. The message is shown to the customer."""


class Cart:
    def __init__(self, request):
        self.session = request.session
        self.notices = []   # messages for the customer (e.g. "… was removed")
        self._items = self._clean(self.session.get(SESSION_KEY, {}))

    # ----------------------------------------------------------- changes
    def add(self, product_id, quantity=1):
        """Add a product, or increase its quantity if it's already in the basket."""
        product = self._get_product(product_id)
        current = self._items.get(str(product.id), 0)
        self._set(product, current + quantity)

    def update(self, product_id, quantity):
        """Set the exact quantity of a product already in the basket."""
        product = self._get_product(product_id)
        if str(product.id) not in self._items:
            raise CartError("This product is not in your basket.")
        self._set(product, quantity)

    def remove(self, product_id):
        self._items.pop(str(product_id), None)
        self._save()

    def clear(self):
        self._items = {}
        self._save()

    # ----------------------------------------------------------- reading
    def summary(self):
        """The full basket with fresh prices from the database."""
        lines = self._lines()
        subtotal = sum((line["line_total"] for line in lines), Decimal("0.00"))
        return {
            "lines": lines,
            "total_quantity": sum(line["quantity"] for line in lines),
            "subtotal": subtotal,
            "total": subtotal,   # no delivery fee or tax: payment is cash on delivery
            "notices": self.notices,
        }

    # ----------------------------------------------------------- helpers
    def _lines(self):
        """
        One line per product, read fresh from the database.
        Removes products that were hidden or sold out, and lowers quantities
        that are now above the stock (with a message for the customer).
        """
        ids = [int(product_id) for product_id in self._items]
        products = {p.id: p for p in visible_products().filter(pk__in=ids)}

        lines, changed = [], False
        for key, quantity in list(self._items.items()):
            product = products.get(int(key))

            if product is None:
                del self._items[key]
                self.notices.append("A product is no longer available and was removed from your basket.")
                changed = True
                continue
            if product.stock == 0:
                del self._items[key]
                self.notices.append(f"{product.name} is sold out and was removed from your basket.")
                changed = True
                continue
            if quantity > product.stock:
                quantity = product.stock
                self._items[key] = quantity
                self.notices.append(f"Only {quantity} of {product.name} left, so we updated your basket.")
                changed = True

            lines.append({
                "product": product,
                "quantity": quantity,
                "line_total": product.price * quantity,
            })

        if changed:
            self._save()
        return lines

    def _get_product(self, product_id):
        product = visible_products().filter(pk=product_id).first()
        if product is None:
            raise CartError("This product is no longer available.")
        return product

    def _set(self, product, quantity):
        if product.stock == 0:
            raise CartError(f"Sorry, {product.name} is sold out.")
        limit = min(product.stock, MAX_QUANTITY)
        if quantity > limit:
            raise CartError(f"Only {limit} of {product.name} available.")
        self._items[str(product.id)] = quantity
        self._save()

    def _save(self):
        self.session[SESSION_KEY] = self._items
        self.session.modified = True   # tell Django to save the session

    @staticmethod
    def _clean(stored):
        """Keep only valid {"id": quantity} pairs (protects against broken session data)."""
        clean = {}
        if not isinstance(stored, dict):
            return clean
        for key, value in stored.items():
            try:
                product_id, quantity = int(key), int(value)
            except (TypeError, ValueError):
                continue
            if product_id > 0 and quantity > 0:
                clean[str(product_id)] = min(quantity, MAX_QUANTITY)
        return clean
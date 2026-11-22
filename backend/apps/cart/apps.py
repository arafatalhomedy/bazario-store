from django.apps import AppConfig


class CartConfig(AppConfig):
    """The shopping basket. Stored in the visitor's session (no database table)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.cart"
    label = "cart"
    verbose_name = "Cart"
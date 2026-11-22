from django.apps import AppConfig


class OrdersConfig(AppConfig):
    """The orders app: placing orders and tracking them."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.orders"
    label = "orders"
    verbose_name = "Orders"
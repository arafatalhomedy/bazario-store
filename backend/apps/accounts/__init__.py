from django.apps import AppConfig


class AccountsConfig(AppConfig):
    """Customer accounts: sign up, log in, log out (Django's built-in users)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
    label = "accounts"
    verbose_name = "Accounts"
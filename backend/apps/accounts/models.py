from django.conf import settings
from django.contrib.auth.models import User
from django.db import models
from django.db.models.functions import Lower


class CustomerProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="customer_profile",
    )
    username = models.CharField(max_length=24, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower("username"),
                condition=~models.Q(username=""),
                name="accounts_profile_username_ci_uniq",
            ),
        ]


class Customer(User):
    """Present existing shopper accounts in a dedicated admin directory."""

    class Meta:
        proxy = True
        verbose_name = "Customer"
        verbose_name_plural = "Customers"
        default_permissions = ("view",)


class AdminAvatar(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, primary_key=True, related_name="admin_avatar",
        on_delete=models.CASCADE,
    )
    jpeg = models.BinaryField()

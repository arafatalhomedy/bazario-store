import django.contrib.auth.models
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_customerprofile_accounts_profile_username_ci_uniq"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.CreateModel(
            name="Customer",
            fields=[],
            options={
                "verbose_name": "Customer",
                "verbose_name_plural": "Customers",
                "proxy": True,
                "default_permissions": ("view",),
                "indexes": [],
                "constraints": [],
            },
            bases=("auth.user",),
            managers=[("objects", django.contrib.auth.models.UserManager())],
        ),
    ]
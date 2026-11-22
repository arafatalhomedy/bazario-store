from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [("orders", "0004_rename_received_label_to_pending")]
    operations = [
        migrations.CreateModel(
            name="OrderItemChange",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("product_name", models.CharField(max_length=200)),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=10)),
                ("quantity_before", models.PositiveIntegerField()),
                ("quantity_after", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="item_changes", to="orders.order")),
            ],
            options={"ordering": ["-created_at", "id"]},
        ),
    ]

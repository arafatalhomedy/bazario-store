from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("products", "0001_initial")]
    operations = [
        migrations.AddField("product", "promotion_starts", models.DateTimeField(null=True, editable=False, db_index=True)),
        migrations.AddField("product", "promotion_ends", models.DateTimeField(null=True, editable=False, db_index=True)),
        migrations.AddField("product", "queued_price", models.DecimalField(max_digits=10, decimal_places=2, null=True, editable=False)),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("orders", "0006_ordercancellationrequest")]
    operations = [
        migrations.AddField(
            model_name="ordercancellationrequest",
            name="decline_reason",
            field=models.CharField(max_length=500, blank=True, default=""),
        ),
    ]

import secrets

from django.db import migrations, models


def backfill_tracking_tokens(apps, schema_editor):
    Order = apps.get_model("ordering", "Order")
    for order in Order.objects.only("id").iterator():
        Order.objects.filter(pk=order.pk).update(tracking_token=secrets.token_urlsafe())


class Migration(migrations.Migration):
    dependencies = [
        ("ordering", "0001_initial"),
    ]

    operations = [
        # A single `AddField` with a callable `unique` default would call
        # that callable once and stamp every existing row with the SAME
        # value (Django backfills a bulk-add via one effective default),
        # which then fails the unique constraint on any table with more
        # than one row. Add nullable/non-unique first, backfill a real
        # per-row value in Python, then tighten it — the documented
        # pattern for adding a unique field to a non-empty table.
        migrations.AddField(
            model_name="order",
            name="tracking_token",
            field=models.CharField(max_length=64, null=True, editable=False),
        ),
        migrations.RunPython(backfill_tracking_tokens, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="order",
            name="tracking_token",
            field=models.CharField(default=secrets.token_urlsafe, max_length=64, unique=True),
        ),
    ]

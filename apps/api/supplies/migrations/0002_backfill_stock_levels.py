from django.db import migrations


def backfill(apps, schema_editor):
    StockItem = apps.get_model("supplies", "StockItem")
    StockLevel = apps.get_model("supplies", "StockLevel")
    missing = StockItem.objects.filter(level__isnull=True)
    StockLevel.objects.bulk_create(
        [StockLevel(stock_item=i, hub_id=i.hub_id) for i in missing]
    )


class Migration(migrations.Migration):
    dependencies = [("supplies", "0001_initial")]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]

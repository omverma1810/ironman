from django.apps import AppConfig


class SuppliesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "supplies"

    def ready(self):
        from django.db.models.signals import post_save

        from supplies.models import StockItem
        from supplies.signals import ensure_stock_level

        post_save.connect(ensure_stock_level, sender=StockItem, dispatch_uid="supplies_level")

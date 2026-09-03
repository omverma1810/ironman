from django.contrib import admin

from supplies.models import ConsumptionRule, StockItem, StockLevel, StockMovement


@admin.register(StockItem)
class StockItemAdmin(admin.ModelAdmin):
    list_display = ["sku", "name", "hub", "category", "unit", "reorder_level", "is_active"]
    list_filter = ["hub", "category", "is_active"]
    search_fields = ["sku", "name"]


@admin.register(StockLevel)
class StockLevelAdmin(admin.ModelAdmin):
    list_display = ["stock_item", "hub", "qty_on_hand", "avg_unit_cost_minor"]
    list_filter = ["hub"]
    search_fields = ["stock_item__sku", "stock_item__name"]


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ["stock_item", "hub", "kind", "delta_qty", "actor", "at"]
    list_filter = ["kind", "hub"]
    search_fields = ["stock_item__sku"]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ConsumptionRule)
class ConsumptionRuleAdmin(admin.ModelAdmin):
    list_display = ["service", "garment_type", "stock_item", "qty_per_unit"]
    list_filter = ["service"]

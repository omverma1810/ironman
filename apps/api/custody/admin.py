from django.contrib import admin

from custody.models import Bag, GarmentLine, QcCheck, StageEvent


class GarmentLineInline(admin.TabularInline):
    model = GarmentLine
    extra = 0
    fields = ["seq", "garment_type", "stage", "is_rework", "rework_count"]
    readonly_fields = ["seq", "garment_type"]


class StageEventInline(admin.TabularInline):
    model = StageEvent
    extra = 0
    fields = ["from_stage", "to_stage", "actor", "scanned", "occurred_at"]
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Bag)
class BagAdmin(admin.ModelAdmin):
    list_display = ["code", "order", "hub", "current_stage", "garment_count", "printed_at"]
    list_filter = ["hub", "current_stage"]
    search_fields = ["code", "order__ref"]
    readonly_fields = ["code"]
    inlines = [GarmentLineInline, StageEventInline]


@admin.register(GarmentLine)
class GarmentLineAdmin(admin.ModelAdmin):
    list_display = ["bag", "seq", "garment_type", "stage", "is_rework", "rework_count"]
    list_filter = ["stage", "is_rework", "hub"]
    search_fields = ["bag__code"]


@admin.register(QcCheck)
class QcCheckAdmin(admin.ModelAdmin):
    list_display = ["garment_line", "result", "checked_by", "at"]
    list_filter = ["result"]


@admin.register(StageEvent)
class StageEventAdmin(admin.ModelAdmin):
    list_display = [
        "bag",
        "garment_line",
        "from_stage",
        "to_stage",
        "actor",
        "scanned",
        "occurred_at",
    ]
    list_filter = ["to_stage", "scanned", "hub"]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

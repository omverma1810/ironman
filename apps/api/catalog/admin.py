from django.contrib import admin

from catalog.models import GarmentType, Offer, Package, PriceLine, PriceList, Service


class PriceLineInline(admin.TabularInline):
    model = PriceLine
    extra = 0


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "unit", "sla_hours", "is_active"]


@admin.register(GarmentType)
class GarmentTypeAdmin(admin.ModelAdmin):
    list_display = ["name", "service", "code", "is_active"]
    list_filter = ["service"]


@admin.register(PriceList)
class PriceListAdmin(admin.ModelAdmin):
    list_display = ["service", "hub", "version", "status", "effective_from", "effective_to"]
    list_filter = ["hub", "service", "status"]
    inlines = [PriceLineInline]


@admin.register(Offer)
class OfferAdmin(admin.ModelAdmin):
    list_display = [
        "code",
        "kind",
        "is_active",
        "effective_from",
        "effective_to",
        "redemptions_count",
    ]
    list_filter = ["kind", "is_active"]


@admin.register(Package)
class PackageAdmin(admin.ModelAdmin):
    list_display = ["name", "service", "cycle", "included_qty", "price_minor", "is_active"]

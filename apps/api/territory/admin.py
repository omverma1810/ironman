from django.contrib import admin

from territory.models import (
    Apartment,
    ApartmentContact,
    Cluster,
    Hub,
    RouteDayCapacity,
    ServiceArea,
    TaxSettings,
)


class ApartmentContactInline(admin.TabularInline):
    model = ApartmentContact
    extra = 0


@admin.register(Hub)
class HubAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "daily_pressing_capacity", "is_active"]


@admin.register(TaxSettings)
class TaxSettingsAdmin(admin.ModelAdmin):
    list_display = ["hub", "gst_enabled", "gstin", "default_rate_bps"]


@admin.register(Cluster)
class ClusterAdmin(admin.ModelAdmin):
    list_display = ["name", "hub", "is_active"]
    list_filter = ["hub", "is_active"]


@admin.register(Apartment)
class ApartmentAdmin(admin.ModelAdmin):
    list_display = ["name", "cluster", "pincode", "is_active", "launched_on"]
    list_filter = ["cluster__hub", "is_active"]
    search_fields = ["name", "pincode"]
    inlines = [ApartmentContactInline]


@admin.register(ServiceArea)
class ServiceAreaAdmin(admin.ModelAdmin):
    list_display = ["hub", "pincode", "is_active"]


@admin.register(RouteDayCapacity)
class RouteDayCapacityAdmin(admin.ModelAdmin):
    list_display = [
        "cluster",
        "date",
        "kind",
        "window_start",
        "window_end",
        "capacity",
        "booked_count",
    ]
    list_filter = ["cluster", "kind", "date"]

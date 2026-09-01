from django.contrib import admin

from ordering.models import Order, OrderEvent, OrderException, OrderLine, ReQuote


class OrderLineInline(admin.TabularInline):
    model = OrderLine
    extra = 0


class OrderEventInline(admin.TabularInline):
    model = OrderEvent
    extra = 0
    readonly_fields = ["event_type", "from_status", "to_status", "actor", "created_at"]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = [
        "ref",
        "hub",
        "customer",
        "status",
        "payment_status",
        "channel",
        "total_minor",
        "created_at",
    ]
    list_filter = ["hub", "status", "payment_status", "channel"]
    search_fields = ["ref", "customer__name", "customer__phone"]
    inlines = [OrderLineInline, OrderEventInline]
    readonly_fields = ["ref"]


@admin.register(ReQuote)
class ReQuoteAdmin(admin.ModelAdmin):
    list_display = ["order", "old_total_minor", "new_total_minor", "decision", "sent_at"]


@admin.register(OrderException)
class OrderExceptionAdmin(admin.ModelAdmin):
    list_display = ["order", "kind", "severity", "status", "assigned_to", "sla_due_at"]
    list_filter = ["kind", "severity", "status"]

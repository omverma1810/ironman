from django.contrib import admin

from notifications.models import (
    NotificationDelivery,
    NotificationPref,
    NotificationRequest,
    NotificationTemplate,
)


@admin.register(NotificationTemplate)
class NotificationTemplateAdmin(admin.ModelAdmin):
    """Template CRUD stays admin-only (no public API — docs/04 §3.11
    lists no template endpoints) — a WhatsApp BSP approval workflow isn't
    something to build a UI around before there's a BSP account to
    approve against."""

    list_display = ["code", "channel", "locale", "approval_status", "updated_at"]
    list_filter = ["channel", "approval_status", "locale"]
    search_fields = ["code", "body"]


class NotificationDeliveryInline(admin.TabularInline):
    model = NotificationDelivery
    extra = 0
    fields = ["provider", "status", "provider_message_id", "error", "created_at"]
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(NotificationRequest)
class NotificationRequestAdmin(admin.ModelAdmin):
    list_display = ["template", "channel", "recipient_kind", "order", "status", "created_at"]
    list_filter = ["channel", "status", "recipient_kind"]
    search_fields = ["order__ref", "dedupe_key"]
    readonly_fields = ["dedupe_key"]
    inlines = [NotificationDeliveryInline]


@admin.register(NotificationPref)
class NotificationPrefAdmin(admin.ModelAdmin):
    list_display = ["recipient_kind", "recipient_id", "channel", "opted_in", "updated_at"]
    list_filter = ["channel", "opted_in", "recipient_kind"]

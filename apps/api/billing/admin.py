from django.contrib import admin

from billing.models import CreditNote, Invoice, Payment


class CreditNoteInline(admin.TabularInline):
    model = CreditNote
    extra = 0
    fields = ["reason", "amount_minor", "issued_by", "at"]
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    fields = ["method", "amount_minor", "status", "gateway_ref", "collected_by", "at"]
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ["ref", "order", "customer", "hub", "status", "total_minor", "issued_at"]
    list_filter = ["status", "hub", "gst_applied"]
    search_fields = ["ref", "order__ref", "customer__name"]
    readonly_fields = ["ref"]
    inlines = [CreditNoteInline, PaymentInline]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CreditNote)
class CreditNoteAdmin(admin.ModelAdmin):
    list_display = ["invoice", "reason", "amount_minor", "issued_by", "at"]
    list_filter = ["hub"]
    search_fields = ["invoice__ref"]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ["invoice", "method", "amount_minor", "status", "collected_by", "at"]
    list_filter = ["method", "status", "hub"]
    search_fields = ["invoice__ref", "idempotency_key", "gateway_ref"]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

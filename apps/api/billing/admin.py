from django.contrib import admin

from billing.models import (
    CashDeposit,
    CashHandover,
    CreditEntry,
    CreditNote,
    CustomerCredit,
    Invoice,
    OrderCost,
    Payment,
)


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


@admin.register(CashHandover)
class CashHandoverAdmin(admin.ModelAdmin):
    list_display = [
        "from_user",
        "to_user",
        "hub",
        "declared_amount_minor",
        "received_amount_minor",
        "variance_minor",
        "status",
        "created_at",
    ]
    list_filter = ["status", "hub"]
    search_fields = ["from_user__email", "to_user__email"]

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CashDeposit)
class CashDepositAdmin(admin.ModelAdmin):
    list_display = ["hub", "amount_minor", "deposited_by", "reference", "at"]
    list_filter = ["hub"]
    search_fields = ["reference"]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(OrderCost)
class OrderCostAdmin(admin.ModelAdmin):
    list_display = ["order", "kind", "amount_minor", "source_ref", "at"]
    list_filter = ["kind"]
    search_fields = ["order__ref", "source_ref"]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CreditEntry)
class CreditEntryAdmin(admin.ModelAdmin):
    list_display = ["customer", "reason", "delta_minor", "order", "created_by", "at"]
    list_filter = ["reason"]
    search_fields = ["customer__name", "customer__phone"]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CustomerCredit)
class CustomerCreditAdmin(admin.ModelAdmin):
    list_display = ["customer", "balance_minor", "updated_at"]
    search_fields = ["customer__name", "customer__phone"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

from django.contrib import admin

from customers.models import Address, ConsentRecord, Customer, CustomerNote


class AddressInline(admin.TabularInline):
    model = Address
    extra = 0


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "hub", "status", "lifetime_orders", "acquisition_channel"]
    list_filter = ["hub", "status", "acquisition_channel"]
    search_fields = ["name", "phone", "email"]
    inlines = [AddressInline]


@admin.register(ConsentRecord)
class ConsentRecordAdmin(admin.ModelAdmin):
    list_display = ["customer", "purpose", "granted", "created_at"]


@admin.register(CustomerNote)
class CustomerNoteAdmin(admin.ModelAdmin):
    list_display = ["customer", "author", "is_internal", "created_at"]

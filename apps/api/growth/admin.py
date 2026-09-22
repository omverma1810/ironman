from django.contrib import admin

from growth.models import Channel, Feedback, ReferralCode, ReferralPartner


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ["order", "customer", "rating", "is_public", "created_at"]
    list_filter = ["rating", "is_public"]
    search_fields = ["order__ref", "customer__name", "customer__phone"]


@admin.register(Channel)
class ChannelAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "is_paid"]
    list_filter = ["is_paid"]


@admin.register(ReferralPartner)
class ReferralPartnerAdmin(admin.ModelAdmin):
    list_display = ["name", "kind", "phone", "hub", "status", "onboarded_by", "created_at"]
    list_filter = ["kind", "status", "hub"]
    search_fields = ["name", "phone"]


@admin.register(ReferralCode)
class ReferralCodeAdmin(admin.ModelAdmin):
    list_display = [
        "code",
        "hub",
        "owner_partner",
        "owner_customer",
        "is_active",
        "uses_count",
        "created_at",
    ]
    list_filter = ["is_active", "hub"]
    search_fields = ["code", "owner_partner__name", "owner_customer__name"]

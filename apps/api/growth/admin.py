from django.contrib import admin

from growth.models import Feedback


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ["order", "customer", "rating", "is_public", "created_at"]
    list_filter = ["rating", "is_public"]
    search_fields = ["order__ref", "customer__name", "customer__phone"]

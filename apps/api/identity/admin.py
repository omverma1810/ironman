from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from identity.models import (
    AuditEvent,
    EmailVerificationToken,
    OtpChallenge,
    PasswordResetToken,
    Role,
    StaffInvite,
    StaffProfile,
    User,
    UserRole,
)


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    fieldsets = None
    add_fieldsets = None
    list_display = ["email", "phone", "full_name", "is_staff", "is_active", "created_at"]
    list_filter = ["is_staff", "is_active"]
    search_fields = ["email", "phone", "full_name"]
    ordering = ["-created_at"]
    filter_horizontal = ()
    readonly_fields = ["created_at", "updated_at"]


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ["code", "name"]


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ["user", "role", "hub", "created_at"]
    list_filter = ["role", "hub"]
    autocomplete_fields = ["user"]


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display = ["employee_code", "user", "hub", "is_field_staff", "joined_at"]
    list_filter = ["hub", "is_field_staff"]


@admin.register(StaffInvite)
class StaffInviteAdmin(admin.ModelAdmin):
    list_display = ["email", "role", "hub", "invited_by", "expires_at", "accepted_at"]


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ["created_at", "action", "object_type", "object_id", "actor", "hub"]
    list_filter = ["action", "object_type", "hub"]
    search_fields = ["object_id", "actor__email", "actor__phone"]
    readonly_fields = [f.name for f in AuditEvent._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(OtpChallenge)
admin.site.register(EmailVerificationToken)
admin.site.register(PasswordResetToken)

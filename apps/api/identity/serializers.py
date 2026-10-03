from __future__ import annotations

from django.contrib.auth import password_validation
from rest_framework import serializers

from identity.models import AuditEvent, Role, StaffInvite, User, UserRole


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ["code", "name", "description"]


class MeSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    hub_scope = serializers.SerializerMethodField()
    requires_mfa = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "phone",
            "full_name",
            "preferred_language",
            "email_verified_at",
            "phone_verified_at",
            "mfa_enabled",
            "roles",
            "hub_scope",
            "requires_mfa",
        ]
        read_only_fields = fields

    def get_roles(self, obj) -> list[str]:
        return sorted(obj.role_codes)

    def get_hub_scope(self, obj) -> list[str] | str:
        return [str(h) for h in obj.hub_scope] if not obj.is_unrestricted else "all"

    def get_requires_mfa(self, obj) -> bool:
        return obj.requires_mfa()


class DeleteAccountSerializer(serializers.Serializer):
    """DELETE /me (docs/06 §6): `code` is a fresh OTP sent to the account's
    phone, so a borrowed unlocked phone with an open session isn't enough."""

    code = serializers.CharField(max_length=6)
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)


class MeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["full_name", "preferred_language"]


class StaffSerializer(serializers.ModelSerializer):
    """A minimal staff-picker shape (docs/04) — for assigning a route-day
    job to a rider, not the full staff-management screen (Phase 2+)."""

    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "full_name", "email", "phone", "roles"]
        read_only_fields = fields

    def get_roles(self, obj) -> list[str]:
        return sorted(obj.role_codes)


class OtpRequestSerializer(serializers.Serializer):
    phone = serializers.RegexField(r"^\+?[1-9]\d{7,14}$")
    purpose = serializers.ChoiceField(choices=["LOGIN", "VERIFY"], default="LOGIN")


class OtpVerifySerializer(serializers.Serializer):
    phone = serializers.RegexField(r"^\+?[1-9]\d{7,14}$")
    code = serializers.RegexField(r"^\d{6}$")
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=150)


class StaffLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)
    totp_code = serializers.CharField(required=False, allow_blank=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(trim_whitespace=False)

    def validate_new_password(self, value):
        password_validation.validate_password(value)
        return value


class EmailVerifyConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()


class StaffInviteAcceptSerializer(serializers.Serializer):
    token = serializers.CharField()
    full_name = serializers.CharField(max_length=150)
    password = serializers.CharField(trim_whitespace=False)

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value


class AuditEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditEvent
        fields = [
            "id",
            "created_at",
            "actor",
            "actor_name",
            "actor_role",
            "action",
            "object_type",
            "object_id",
            "hub",
            "before",
            "after",
            "ip",
        ]

    def get_actor_name(self, obj) -> str:
        if obj.actor is None:
            return "System"
        return obj.actor.full_name or obj.actor.email or obj.actor.phone or ""


class TeamRoleSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source="role.code")
    hub_name = serializers.CharField(source="hub.name", default="", read_only=True)

    class Meta:
        model = UserRole
        fields = ["role", "hub", "hub_name"]


class TeamMemberSerializer(serializers.ModelSerializer):
    """The staff-management screen's row (docs/06 §3.1 "Manage users & roles")."""

    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "full_name", "email", "phone", "is_active", "last_login", "roles"]
        read_only_fields = fields

    def get_roles(self, obj) -> list[dict]:
        from identity.models import STAFF_ROLES

        rows = [ur for ur in obj.user_roles.all() if ur.role.code in STAFF_ROLES]
        return TeamRoleSerializer(rows, many=True).data


class StaffInviteSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source="role.code", read_only=True)
    hub_name = serializers.CharField(source="hub.name", default="", read_only=True)
    invited_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StaffInvite
        fields = ["id", "email", "role", "hub", "hub_name", "invited_by_name", "expires_at"]
        read_only_fields = fields

    def get_invited_by_name(self, obj) -> str:
        user = obj.invited_by
        return (user.full_name or user.email or "") if user else ""


class StaffInviteCreatedSerializer(StaffInviteSerializer):
    """Returned once, to the person who created the invite: the token is
    what they send to the new staff member."""

    class Meta(StaffInviteSerializer.Meta):
        fields = StaffInviteSerializer.Meta.fields + ["token"]
        read_only_fields = fields


class StaffInviteCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.CharField()
    hub = serializers.UUIDField(required=False, allow_null=True)


class TeamRoleChangeSerializer(serializers.Serializer):
    role = serializers.CharField()
    hub = serializers.UUIDField(required=False, allow_null=True)


class TeamActiveSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)

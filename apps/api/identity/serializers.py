from __future__ import annotations

from django.contrib.auth import password_validation
from rest_framework import serializers

from identity.models import Role, User


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


class MeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["full_name", "preferred_language"]


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

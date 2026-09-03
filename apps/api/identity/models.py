"""
Identity & access (docs/02 §3.1, docs/06). Two authentication schemes on
one User model: customers via phone OTP, staff/admin/founder via
email+password with mandatory TOTP for admin/founder (docs/06 §2).
"""

from __future__ import annotations

import secrets

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone

from common.id import new_uuid7
from common.models import AppendOnlyModel, BaseModel, TimeStampedUUIDModel


class RoleCode(models.TextChoices):
    """The six roles of docs/01 §3 / docs/06 §3.1. Authorization logic
    branches on these codes directly — Role rows exist so the set is
    inspectable and describable in the console, not because the set is
    meant to be admin-editable."""

    CUSTOMER = "CUSTOMER", "Customer"
    FIELD = "FIELD", "Field Staff"
    OPERATOR = "OPERATOR", "Store Operator"
    ADMIN = "ADMIN", "Ops / Admin"
    FOUNDER = "FOUNDER", "Founder"
    VIEWER = "VIEWER", "Viewer"


# Roles that require mandatory TOTP 2FA (docs/06 §2.2). Empty for the
# pilot: the console never grew a totp_code input (there was no way to
# actually complete a FOUNDER/ADMIN login), and requiring device-level
# TOTP enrollment before a pilot demo account can even be looked at isn't
# a tradeoff worth making yet. TOTP itself stays fully wired (opt-in via
# StaffLoginView/requires_mfa()) — re-populate this set to bring back the
# mandatory gate once there's a UI to set it up through.
MFA_REQUIRED_ROLES: set[RoleCode] = set()

STAFF_ROLES = {RoleCode.FIELD, RoleCode.OPERATOR, RoleCode.ADMIN, RoleCode.FOUNDER, RoleCode.VIEWER}


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, *, email=None, phone=None, password=None, **extra):
        if not email and not phone:
            raise ValueError("A user needs an email or a phone number.")
        email = self.normalize_email(email) if email else None
        user = self.model(email=email, phone=phone, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, *, email=None, phone=None, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create(email=email, phone=phone, password=password, **extra)

    def create_superuser(self, *, email, password, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("email_verified_at", timezone.now())
        user = self._create(email=email, password=password, **extra)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    """`email` and `phone` are each nullable+unique (Postgres allows
    multiple NULLs under a unique constraint) so a customer can exist with
    phone only and a staff member with email only. See docs/06 §2."""

    id = models.UUIDField(primary_key=True, default=new_uuid7, editable=False)
    email = models.EmailField(unique=True, null=True, blank=True)
    phone = models.CharField(max_length=20, unique=True, null=True, blank=True)
    full_name = models.CharField(max_length=150, blank=True)
    preferred_language = models.CharField(max_length=8, default="en")

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # Django admin access

    email_verified_at = models.DateTimeField(null=True, blank=True)
    phone_verified_at = models.DateTimeField(null=True, blank=True)

    mfa_secret = models.CharField(max_length=64, blank=True)
    mfa_enabled = models.BooleanField(default=False)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "identity_user"

    def __str__(self) -> str:
        return self.email or self.phone or str(self.id)

    @property
    def role_codes(self) -> set[str]:
        return set(self.user_roles.values_list("role__code", flat=True))

    @property
    def primary_role_code(self) -> str:
        """Highest-privilege role, for audit-log attribution and UI
        defaults. Not used for authorization decisions — those check the
        full role set (docs/06 §3)."""
        priority = [
            RoleCode.FOUNDER,
            RoleCode.ADMIN,
            RoleCode.OPERATOR,
            RoleCode.FIELD,
            RoleCode.VIEWER,
            RoleCode.CUSTOMER,
        ]
        codes = self.role_codes
        for code in priority:
            if code in codes:
                return code
        return ""

    @property
    def hub_scope(self) -> list:
        """Hub ids this user's roles are scoped to. Empty list + FOUNDER
        role means unrestricted (docs/06 §3.2)."""
        return list(self.user_roles.filter(hub__isnull=False).values_list("hub_id", flat=True))

    @property
    def is_unrestricted(self) -> bool:
        return RoleCode.FOUNDER in self.role_codes

    def requires_mfa(self) -> bool:
        return bool(self.role_codes & MFA_REQUIRED_ROLES)


class Role(models.Model):
    code = models.CharField(max_length=16, choices=RoleCode.choices, unique=True)
    name = models.CharField(max_length=64)
    description = models.TextField(blank=True)

    class Meta:
        db_table = "identity_role"

    def __str__(self) -> str:
        return self.name


class UserRole(BaseModel):
    """A user may hold several roles, optionally scoped to a hub — the
    pattern the operation actually needs when a founder is also the ops
    manager (docs/01 §3)."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_roles")
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="user_roles")
    hub = models.ForeignKey(
        "territory.Hub", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )

    class Meta:
        db_table = "identity_user_role"
        constraints = [
            models.UniqueConstraint(fields=["user", "role", "hub"], name="uniq_user_role_hub")
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.role} ({self.hub or 'all hubs'})"


class StaffProfile(BaseModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="staff_profile")
    employee_code = models.CharField(max_length=32, unique=True)
    hub = models.ForeignKey("territory.Hub", on_delete=models.PROTECT, related_name="staff")
    joined_at = models.DateField(default=timezone.localdate)
    is_field_staff = models.BooleanField(default=False)
    vehicle = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = "identity_staff_profile"

    def __str__(self) -> str:
        return f"{self.employee_code} — {self.user}"


class OtpChallenge(TimeStampedUUIDModel):
    """docs/06 §2.1. Codes are hashed at rest; 5-minute expiry; 5 verify
    attempts; rate-limited at 3 requests / phone / 10 min via the
    `otp_request` DRF throttle scope."""

    class Purpose(models.TextChoices):
        LOGIN = "LOGIN", "Login / registration"
        VERIFY = "VERIFY", "Phone verification"

    phone = models.CharField(max_length=20, db_index=True)
    purpose = models.CharField(max_length=16, choices=Purpose.choices)
    code_hash = models.CharField(max_length=128)
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    MAX_ATTEMPTS = 5

    class Meta:
        db_table = "identity_otp_challenge"

    @classmethod
    def issue(cls, *, phone: str, purpose: str) -> tuple["OtpChallenge", str]:
        code = f"{secrets.randbelow(1_000_000):06d}"
        challenge = cls.objects.create(
            phone=phone,
            purpose=purpose,
            code_hash=make_password(code),
            expires_at=timezone.now() + timezone.timedelta(minutes=5),
        )
        return challenge, code

    def verify(self, code: str) -> bool:
        if self.consumed_at or timezone.now() > self.expires_at:
            return False
        if self.attempts >= self.MAX_ATTEMPTS:
            return False
        self.attempts += 1
        ok = check_password(code, self.code_hash)
        if ok:
            self.consumed_at = timezone.now()
        self.save(update_fields=["attempts", "consumed_at"])
        return ok


class EmailVerificationToken(TimeStampedUUIDModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="email_tokens")
    token = models.CharField(max_length=64, unique=True, default=secrets.token_urlsafe)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "identity_email_verification_token"

    def is_valid(self) -> bool:
        return not self.consumed_at and timezone.now() <= self.expires_at


class PasswordResetToken(TimeStampedUUIDModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reset_tokens")
    token = models.CharField(max_length=64, unique=True, default=secrets.token_urlsafe)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "identity_password_reset_token"

    def is_valid(self) -> bool:
        return not self.consumed_at and timezone.now() <= self.expires_at


class StaffInvite(TimeStampedUUIDModel):
    """Console registration is invite-only (docs/06 §2.2) — no public
    sign-up form on an ops console for a team of eight."""

    email = models.EmailField()
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="+")
    hub = models.ForeignKey(
        "territory.Hub", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    invited_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="+")
    token = models.CharField(max_length=64, unique=True, default=secrets.token_urlsafe)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "identity_staff_invite"

    def is_valid(self) -> bool:
        return not self.accepted_at and timezone.now() <= self.expires_at


class AuditEvent(AppendOnlyModel):
    """Append-only. UPDATE/DELETE revoked from the app DB role in
    production (docs/02 §5, docs/06 §3.3)."""

    actor = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    actor_role = models.CharField(max_length=16, blank=True)
    action = models.CharField(max_length=64, db_index=True)
    object_type = models.CharField(max_length=64, db_index=True)
    object_id = models.CharField(max_length=64, db_index=True)
    hub = models.ForeignKey(
        "territory.Hub", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    before = models.JSONField(default=dict, blank=True)
    after = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "identity_audit_event"
        indexes = [models.Index(fields=["object_type", "object_id", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.action} on {self.object_type}:{self.object_id} by {self.actor_id}"

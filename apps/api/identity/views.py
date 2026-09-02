from __future__ import annotations

import pyotp
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from common import audit
from common.errors import ApiError
from common.permissions import IsAdminOrFounder
from common.throttles import ScopedRateThrottle
from identity.models import (
    EmailVerificationToken,
    OtpChallenge,
    PasswordResetToken,
    Role,
    RoleCode,
    StaffInvite,
    User,
    UserRole,
)
from identity.notify import get_otp_sender
from identity.serializers import (
    EmailVerifyConfirmSerializer,
    MeSerializer,
    MeUpdateSerializer,
    OtpRequestSerializer,
    OtpVerifySerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    StaffInviteAcceptSerializer,
    StaffLoginSerializer,
    StaffSerializer,
)


def _issue_jwt_pair(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


@extend_schema(
    request=OtpRequestSerializer, responses={200: OpenApiResponse(description="Challenge issued")}
)
class OtpRequestView(APIView):
    """POST /auth/otp/request — docs/04 §3.1. Phone-first, no password;
    this is the entry point for the WhatsApp-link booking flow (R-101/R-102)."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_request"

    def post(self, request):
        serializer = OtpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone"]
        purpose = serializer.validated_data["purpose"]

        challenge, code = OtpChallenge.issue(phone=phone, purpose=purpose)
        get_otp_sender().send(phone=phone, code=code, purpose=purpose)

        return Response({"challenge_id": str(challenge.id), "expires_in": 300})


@extend_schema(request=OtpVerifySerializer, responses={200: MeSerializer})
class OtpVerifyView(APIView):
    """POST /auth/otp/verify — creates the customer on first verification
    (docs/04 §3.1)."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_verify"

    def post(self, request):
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone"]
        code = serializer.validated_data["code"]

        challenge = (
            OtpChallenge.objects.filter(phone=phone, consumed_at__isnull=True)
            .order_by("-created_at")
            .first()
        )
        if not challenge or not challenge.verify(code):
            raise ApiError(
                "That code is incorrect or has expired. Request a new one.",
                code="invalid_otp",
                status_code=400,
            )

        user, created = User.objects.get_or_create(
            phone=phone,
            defaults={
                "full_name": serializer.validated_data.get("full_name", ""),
                "phone_verified_at": timezone.now(),
            },
        )
        if not created and not user.phone_verified_at:
            user.phone_verified_at = timezone.now()
            user.save(update_fields=["phone_verified_at"])

        if created:
            role, _ = Role.objects.get_or_create(
                code=RoleCode.CUSTOMER, defaults={"name": "Customer"}
            )
            UserRole.objects.create(user=user, role=role, hub=None)
            audit.record(
                action="user.registered",
                object_type="User",
                object_id=str(user.id),
                actor=user,
                after={"phone": phone},
            )

        tokens = _issue_jwt_pair(user)
        return Response({**tokens, "user": MeSerializer(user).data, "created": created})


@extend_schema(request=StaffLoginSerializer, responses={200: MeSerializer})
class StaffLoginView(APIView):
    """POST /auth/login — session-cookie auth for console users
    (docs/06 §2.2). Mandatory TOTP for ADMIN/FOUNDER."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = StaffLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower()
        password = serializer.validated_data["password"]

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            user = None

        if not user or not user.check_password(password) or not user.is_active:
            audit.record(action="login.failed", object_type="User", object_id=email)
            raise ApiError(
                "That email or password is incorrect.", code="invalid_credentials", status_code=401
            )

        if not user.email_verified_at:
            raise ApiError(
                "Verify your email before logging in. Check your inbox for the link.",
                code="email_not_verified",
                status_code=403,
            )

        if user.requires_mfa():
            totp_code = serializer.validated_data.get("totp_code")
            if not user.mfa_enabled:
                raise ApiError(
                    "Two-factor authentication is required for this account. "
                    "Set it up before logging in.",
                    code="mfa_setup_required",
                    status_code=403,
                )
            if not totp_code or not pyotp.TOTP(user.mfa_secret).verify(totp_code, valid_window=1):
                raise ApiError(
                    "That authentication code is incorrect.",
                    code="invalid_mfa_code",
                    status_code=401,
                )

        django_login(request, user)
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])
        audit.record(action="login.success", object_type="User", object_id=str(user.id), actor=user)
        return Response({"user": MeSerializer(user).data})


@extend_schema(request=None, responses={204: OpenApiResponse(description="Logged out")})
class LogoutView(APIView):
    def post(self, request):
        refresh = request.data.get("refresh")
        if refresh:
            try:
                RefreshToken(refresh).blacklist()
            except Exception:
                pass
        django_logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RefreshView(APIView):
    """Thin wrapper documented for API-surface completeness; simplejwt's
    TokenRefreshView (wired in urls.py) does the actual work with rotation
    + blacklist-on-reuse already configured in settings."""


@extend_schema_view(
    get=extend_schema(responses={200: MeSerializer}),
    patch=extend_schema(request=MeUpdateSerializer, responses={200: MeSerializer}),
)
class MeView(APIView):
    def get(self, request):
        return Response(MeSerializer(request.user).data)

    def patch(self, request):
        serializer = MeUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MeSerializer(request.user).data)


@extend_schema(responses={200: StaffSerializer(many=True)})
class StaffListView(APIView):
    """GET /identity/staff?role= — a minimal staff picker (e.g. assigning
    a route-day job to a rider), hub-scoped like everything else
    (docs/06 §3.2). Not the full staff-management screen (Phase 2+); see
    docs/06 §3.1 "Manage users & roles" — Admin/Founder only."""

    permission_classes = [IsAdminOrFounder]

    def get(self, request):
        user = request.user
        qs = User.objects.filter(user_roles__hub__isnull=False).distinct()
        if not user.is_unrestricted:
            qs = qs.filter(user_roles__hub_id__in=user.hub_scope)
        role = request.query_params.get("role")
        if role:
            qs = qs.filter(user_roles__role__code=role)
        return Response(StaffSerializer(qs.order_by("full_name"), many=True).data)


@extend_schema(
    request=None, responses={200: OpenApiResponse(description="Verification email sent")}
)
class EmailVerifyRequestView(APIView):
    def post(self, request):
        user = request.user
        EmailVerificationToken.objects.filter(user=user, consumed_at__isnull=True).delete()
        token = EmailVerificationToken.objects.create(
            user=user, expires_at=timezone.now() + timezone.timedelta(hours=72)
        )
        # Phase 4 wires the real template + channel; logged for now.
        get_otp_sender().send(phone=user.email or "", code=token.token, purpose="EMAIL_VERIFY")
        return Response({"sent": True})


@extend_schema(
    request=EmailVerifyConfirmSerializer, responses={200: OpenApiResponse(description="Verified")}
)
class EmailVerifyConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = EmailVerifyConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            record = EmailVerificationToken.objects.get(token=serializer.validated_data["token"])
        except EmailVerificationToken.DoesNotExist:
            raise ApiError(
                "That verification link is invalid.", code="invalid_token", status_code=400
            )
        if not record.is_valid():
            raise ApiError(
                "That verification link has expired. Request a new one.",
                code="expired_token",
                status_code=400,
            )
        record.consumed_at = timezone.now()
        record.save(update_fields=["consumed_at"])
        record.user.email_verified_at = timezone.now()
        record.user.save(update_fields=["email_verified_at"])
        return Response({"verified": True})


@extend_schema(
    request=PasswordResetRequestSerializer,
    responses={200: OpenApiResponse(description="Always 200 — no account enumeration")},
)
class PasswordResetRequestView(APIView):
    """Always returns 200 — no account enumeration (docs/06 §2.2)."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower()
        user = User.objects.filter(email=email).first()
        if user:
            PasswordResetToken.objects.filter(user=user, consumed_at__isnull=True).delete()
            token = PasswordResetToken.objects.create(
                user=user, expires_at=timezone.now() + timezone.timedelta(minutes=60)
            )
            get_otp_sender().send(phone=email, code=token.token, purpose="PASSWORD_RESET")
        return Response({"sent": True})


@extend_schema(
    request=PasswordResetConfirmSerializer,
    responses={200: OpenApiResponse(description="Password reset")},
)
class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            record = PasswordResetToken.objects.get(token=serializer.validated_data["token"])
        except PasswordResetToken.DoesNotExist:
            raise ApiError("That reset link is invalid.", code="invalid_token", status_code=400)
        if not record.is_valid():
            raise ApiError(
                "That reset link has expired. Request a new one.",
                code="expired_token",
                status_code=400,
            )
        record.consumed_at = timezone.now()
        record.save(update_fields=["consumed_at"])
        record.user.set_password(serializer.validated_data["new_password"])
        record.user.save(update_fields=["password"])
        audit.record(action="password.reset", object_type="User", object_id=str(record.user_id))
        return Response({"reset": True})


@extend_schema(
    request=None, responses={200: OpenApiResponse(description="TOTP secret + provisioning URI")}
)
class MfaEnrollView(APIView):
    def post(self, request):
        secret = pyotp.random_base32()
        request.user.mfa_secret = secret
        request.user.save(update_fields=["mfa_secret"])
        uri = pyotp.TOTP(secret).provisioning_uri(name=request.user.email, issuer_name="IronMan")
        return Response({"secret": secret, "otpauth_uri": uri})


@extend_schema(request=None, responses={200: OpenApiResponse(description="MFA enabled")})
class MfaVerifyView(APIView):
    def post(self, request):
        code = request.data.get("code", "")
        user = request.user
        if not user.mfa_secret or not pyotp.TOTP(user.mfa_secret).verify(code, valid_window=1):
            raise ApiError(
                "That authentication code is incorrect.", code="invalid_mfa_code", status_code=400
            )
        user.mfa_enabled = True
        user.save(update_fields=["mfa_enabled"])
        audit.record(action="mfa.enabled", object_type="User", object_id=str(user.id), actor=user)
        return Response({"enabled": True})


@extend_schema(
    request=StaffInviteAcceptSerializer,
    responses={201: OpenApiResponse(description="Staff account created")},
)
class StaffInviteAcceptView(APIView):
    """Console registration is invite-only (docs/06 §2.2)."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = StaffInviteAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invite = StaffInvite.objects.get(token=serializer.validated_data["token"])
        except StaffInvite.DoesNotExist:
            raise ApiError("That invite link is invalid.", code="invalid_token", status_code=400)
        if not invite.is_valid():
            raise ApiError(
                "That invite has expired. Ask an admin to resend it.",
                code="expired_token",
                status_code=400,
            )

        user = User.objects.create_user(
            email=invite.email,
            password=serializer.validated_data["password"],
            full_name=serializer.validated_data["full_name"],
            is_staff=True,
        )
        UserRole.objects.create(user=user, role=invite.role, hub=invite.hub)
        invite.accepted_at = timezone.now()
        invite.save(update_fields=["accepted_at"])

        token = EmailVerificationToken.objects.create(
            user=user, expires_at=timezone.now() + timezone.timedelta(hours=72)
        )
        get_otp_sender().send(phone=user.email, code=token.token, purpose="EMAIL_VERIFY")

        audit.record(action="user.invited_and_created", object_type="User", object_id=str(user.id))
        return Response({"created": True, "email": user.email}, status=status.HTTP_201_CREATED)

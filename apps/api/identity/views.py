from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import date

import pyotp
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import (
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

import customers.services as customers_services
import privacy.services as privacy_services
from common import audit
from common.errors import ApiError
from common.permissions import IsAdminOrFounder
from common.throttles import ScopedRateThrottle
from identity import team
from identity.models import (
    AuditEvent,
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
    AuditEventSerializer,
    DeleteAccountSerializer,
    EmailVerifyConfirmSerializer,
    MeSerializer,
    MeUpdateSerializer,
    OtpRequestSerializer,
    OtpVerifySerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    StaffInviteAcceptSerializer,
    StaffInviteCreatedSerializer,
    StaffInviteCreateSerializer,
    StaffInviteSerializer,
    StaffLoginSerializer,
    StaffSerializer,
    TeamActiveSerializer,
    TeamMemberSerializer,
    TeamRoleChangeSerializer,
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
        # docs/06 §6: signing in during the deletion grace period is how a
        # customer changes their mind. Any other deactivated account stays out.
        restored = False
        if not user.is_active:
            pending = privacy_services.pending_request(user)
            if not pending:
                raise ApiError(
                    "This account has been closed. Contact IronMan support if this is a mistake.",
                    code="account_disabled",
                    status_code=403,
                )
            privacy_services.cancel_deletion(pending, via="sign_in")
            user.refresh_from_db()
            restored = True

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

        # Someone added at the counter already has a customer record with
        # this phone but no login: attach it now that they've proved they own
        # the phone, so their history shows and their first booking doesn't
        # collide with a duplicate customer for the same phone.
        customers_services.link_existing_customer(user)

        tokens = _issue_jwt_pair(user)
        return Response(
            {**tokens, "user": MeSerializer(user).data, "created": created, "restored": restored}
        )


@extend_schema(exclude=True)
class OtpDebugView(APIView):
    """E2E-only: `OtpChallenge.code_hash` is hashed at rest, so a test
    driving the booking wizard's phone-verify step has no other way to
    learn the code it just triggered. `identity.urls` only ever routes
    this when `IRONMAN["EXPOSE_OTP_DEBUG_ENDPOINT"]` is on — every
    environment except `config.settings.test` doesn't register the URL
    at all (docs/08 batch 4.3). `exclude=True` keeps it out of the
    checked-in OpenAPI contract too — it isn't real, documented API
    surface, whatever settings module generated the schema."""

    permission_classes = [AllowAny]

    def get(self, request):
        from django.core.cache import cache

        phone = request.query_params.get("phone", "")
        code = cache.get(f"otp-debug:{phone}")
        if not code:
            raise ApiError("No pending code for that phone.", code="not_found", status_code=404)
        return Response({"code": code})


@extend_schema(request=StaffLoginSerializer, responses={200: MeSerializer})
class StaffLoginView(APIView):
    """POST /auth/login — session-cookie auth for console users
    (docs/06 §2.2). TOTP is opt-in for the pilot (`MFA_REQUIRED_ROLES` is
    empty) — `requires_mfa()` still gates this per-user for anyone who has
    turned it on via `MfaSetupView`/`MfaEnableView`."""

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
@extend_schema_view(
    delete=extend_schema(
        request=DeleteAccountSerializer,
        responses={202: OpenApiResponse(description="Deletion scheduled")},
    )
)
class MeView(APIView):
    def get(self, request):
        return Response(MeSerializer(request.user).data)

    def patch(self, request):
        serializer = MeUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        customers_services.sync_name_from_user(request.user)
        return Response(MeSerializer(request.user).data)

    def delete(self, request):
        """DELETE /me — docs/06 §6. Needs a fresh OTP (`code`); refuses with
        the reasons while an order, unpaid invoice or open issue remains."""
        privacy_services.ensure_customer_account(request.user)
        serializer = DeleteAccountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        deletion = privacy_services.request_deletion(
            request.user,
            code=serializer.validated_data["code"],
            reason=serializer.validated_data.get("reason", ""),
        )
        return Response(
            {
                "status": deletion.status,
                "requested_at": deletion.requested_at,
                "scheduled_for": deletion.scheduled_for,
            },
            status=status.HTTP_202_ACCEPTED,
        )


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

        # Accepting a single-use invite an admin sent to this person counts as
        # verifying the address. Staff login requires a verified email, and
        # with no email provider connected a separate verification mail would
        # never arrive, leaving every invited account unable to sign in.
        user = User.objects.create_user(
            email=invite.email,
            password=serializer.validated_data["password"],
            full_name=serializer.validated_data["full_name"],
            is_staff=True,
            email_verified_at=timezone.now(),
        )
        UserRole.objects.create(user=user, role=invite.role, hub=invite.hub)
        invite.accepted_at = timezone.now()
        invite.save(update_fields=["accepted_at"])

        audit.record(action="user.invited_and_created", object_type="User", object_id=str(user.id))
        return Response({"created": True, "email": user.email}, status=status.HTTP_201_CREATED)


def _audit_queryset(request):
    """docs/06 §3.3: admins see their own hubs' events, the founder all of
    them. Events with no hub (sign-ins, account changes) are founder-only."""
    qs = AuditEvent.objects.select_related("actor").order_by("-created_at")
    user = request.user
    if not (user.is_superuser or user.is_unrestricted):
        qs = qs.filter(hub_id__in=user.hub_scope)
    params = request.query_params
    if params.get("action"):
        qs = qs.filter(action__icontains=params["action"].strip())
    if params.get("object_type"):
        qs = qs.filter(object_type=params["object_type"])
    if params.get("object_id"):
        qs = qs.filter(object_id=params["object_id"].strip())
    if params.get("actor"):
        try:
            qs = qs.filter(actor_id=uuid.UUID(params["actor"]))
        except ValueError:
            return qs.none()
    for key, lookup in (("from", "created_at__date__gte"), ("to", "created_at__date__lte")):
        if params.get(key):
            try:
                qs = qs.filter(**{lookup: date.fromisoformat(params[key])})
            except ValueError:
                raise ApiError(f"'{key}' must be a date (YYYY-MM-DD).", status_code=400) from None
    return qs


@extend_schema(responses={200: AuditEventSerializer(many=True)})
class AuditLogView(generics.ListAPIView):
    """GET /identity/audit — docs/06 §3.3, "viewable in the console,
    filterable by object and by actor, exportable". Filters: action
    (contains), object_type, object_id, actor, from, to."""

    permission_classes = [IsAdminOrFounder]
    serializer_class = AuditEventSerializer
    queryset = AuditEvent.objects.none()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return AuditEvent.objects.none()
        return _audit_queryset(self.request)


@extend_schema(responses={200: OpenApiResponse(description="CSV of the filtered audit log")})
class AuditLogExportView(APIView):
    """GET /identity/audit/export.csv — the same filters, as a file."""

    permission_classes = [IsAdminOrFounder]
    LIMIT = 10_000

    def get(self, request):
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            ["when", "who", "role", "action", "object_type", "object_id", "before", "after", "ip"]
        )
        for event in _audit_queryset(request)[: self.LIMIT]:
            writer.writerow(
                [
                    timezone.localtime(event.created_at).isoformat(),
                    AuditEventSerializer().get_actor_name(event),
                    event.actor_role,
                    event.action,
                    event.object_type,
                    event.object_id,
                    json.dumps(event.before, ensure_ascii=False) if event.before else "",
                    json.dumps(event.after, ensure_ascii=False) if event.after else "",
                    event.ip or "",
                ]
            )
        audit.record(
            action="audit.exported", object_type="AuditEvent", object_id="-", actor=request.user
        )
        response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
        stamp = timezone.localdate().isoformat()
        response["Content-Disposition"] = f'attachment; filename="audit-log-{stamp}.csv"'
        return response


# ----------------------------------------------------------- staff management


def _hub_or_none(hub_id):
    if not hub_id:
        return None
    from territory import services as territory_services

    try:
        return territory_services.get_hub(hub_id)
    except Exception:  # noqa: BLE001 — Hub.DoesNotExist, without importing territory.models
        raise ApiError(
            "That hub doesn't exist.", code="validation_error", status_code=400
        ) from None


@extend_schema(
    responses={
        200: inline_serializer(
            "Team",
            fields={
                "members": TeamMemberSerializer(many=True),
                "invites": StaffInviteSerializer(many=True),
            },
        )
    }
)
class TeamView(APIView):
    """GET /identity/team — staff and open invites the caller can manage."""

    permission_classes = [IsAdminOrFounder]

    def get(self, request):
        return Response(
            {
                "members": TeamMemberSerializer(team.members(request.user), many=True).data,
                "invites": StaffInviteSerializer(
                    team.pending_invites(request.user), many=True
                ).data,
            }
        )


@extend_schema(request=StaffInviteCreateSerializer, responses={201: StaffInviteCreatedSerializer})
class TeamInviteView(APIView):
    """POST /identity/team/invites — the response carries the invite token
    once; the console turns it into a link to send the new staff member."""

    permission_classes = [IsAdminOrFounder]

    def post(self, request):
        serializer = StaffInviteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        created = team.invite(
            request.user,
            email=data["email"],
            role_code=data["role"],
            hub=_hub_or_none(data.get("hub")),
        )
        return Response(StaffInviteCreatedSerializer(created).data, status=status.HTTP_201_CREATED)


@extend_schema(request=None, responses={204: None})
class TeamInviteRevokeView(APIView):
    permission_classes = [IsAdminOrFounder]

    def delete(self, request, invite_id):
        team.revoke_invite(request.user, team.find_invite(request.user, invite_id))
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=TeamRoleChangeSerializer, responses={200: TeamMemberSerializer})
class TeamRoleView(APIView):
    permission_classes = [IsAdminOrFounder]

    def post(self, request, user_id):
        serializer = TeamRoleChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = team.find_member(request.user, user_id)
        team.change_role(
            request.user,
            target,
            role_code=serializer.validated_data["role"],
            hub=_hub_or_none(serializer.validated_data.get("hub")),
        )
        return Response(TeamMemberSerializer(team.find_member(request.user, user_id)).data)


@extend_schema(request=TeamActiveSerializer, responses={200: TeamMemberSerializer})
class TeamDeactivateView(APIView):
    """POST /identity/team/{id}/deactivate — signs them out everywhere."""

    permission_classes = [IsAdminOrFounder]
    active = False

    def post(self, request, user_id):
        serializer = TeamActiveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = team.find_member(request.user, user_id)
        team.set_active(
            request.user,
            target,
            active=self.active,
            reason=serializer.validated_data.get("reason", ""),
        )
        target.refresh_from_db()
        return Response(TeamMemberSerializer(target).data)


class TeamReactivateView(TeamDeactivateView):
    """POST /identity/team/{id}/reactivate"""

    active = True

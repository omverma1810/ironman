"""Privacy endpoints (docs/04 §3, docs/06 §5–6). `DELETE /me` itself lives on
`identity.views.MeView` next to GET/PATCH /me and calls into
`privacy.services`."""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import timedelta

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common import audit
from common.errors import ApiError
from common.throttles import ScopedRateThrottle
from privacy import export, retention, services

_BLOCKER_FIELDS = {
    "code": serializers.CharField(),
    "message": serializers.CharField(),
    "refs": serializers.ListField(child=serializers.CharField()),
}


def deletion_payload(request_obj) -> dict:
    return {
        "status": request_obj.status,
        "requested_at": request_obj.requested_at,
        "scheduled_for": request_obj.scheduled_for,
    }


@extend_schema(
    responses={
        200: inline_serializer(
            "DeletionCheck",
            fields={
                "can_delete": serializers.BooleanField(),
                "blockers": inline_serializer("DeletionBlocker", fields=_BLOCKER_FIELDS, many=True),
                "grace_days": serializers.IntegerField(),
            },
        )
    }
)
class DeletionCheckView(APIView):
    """GET /me/deletion — what (if anything) stops this account being
    deleted right now, so the screen can say so before asking for a code."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        services.ensure_customer_account(request.user)
        blockers = services.deletion_blockers(services.customer_for(request.user))
        return Response(
            {
                "can_delete": not blockers,
                "blockers": blockers,
                "grace_days": settings.IRONMAN["DELETION_GRACE_DAYS"],
            }
        )


@extend_schema(responses={200: OpenApiResponse(description="JSON file of the customer's data")})
class DataExportView(APIView):
    """GET /me/export — docs/06 §5 access & portability."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        services.ensure_customer_account(request.user)
        data = export.build(request.user)
        audit.record(
            action="customer.data_exported",
            object_type="User",
            object_id=str(request.user.id),
            actor=request.user,
        )
        body = json.dumps(data, indent=2, ensure_ascii=False)
        response = HttpResponse(body, content_type="application/json; charset=utf-8")
        stamp = timezone.localdate().isoformat()
        response["Content-Disposition"] = f'attachment; filename="ironman-my-data-{stamp}.json"'
        return response


@extend_schema(
    request=inline_serializer("RestoreAccount", fields={"token": serializers.CharField()}),
    responses={200: inline_serializer("Restored", fields={"restored": serializers.BooleanField()})},
)
class RestoreAccountView(APIView):
    """POST /privacy/restore — the link in the "your account will be
    deleted" message. Cancels the deletion and re-enables sign-in."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_verify"

    def post(self, request):
        services.restore_by_token(str(request.data.get("token", "")))
        return Response({"restored": True})


def maintenance_signature(day) -> str:
    key = settings.SECRET_KEY.encode()
    return hmac.new(
        key, f"ironman-maintenance:{day.isoformat()}".encode(), hashlib.sha256
    ).hexdigest()


@extend_schema(exclude=True)
class MaintenanceView(APIView):
    """POST /internal/maintenance — called nightly by the GitHub Actions
    schedule (.github/workflows/maintenance.yml). The caller proves it holds
    the Django secret by sending HMAC(secret, "ironman-maintenance:<UTC
    date>"), so no extra credential has to be provisioned and a captured
    signature is useless the next day."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        given = request.headers.get("X-Maintenance-Signature", "")
        today = timezone.now().date()
        valid = any(
            hmac.compare_digest(given, maintenance_signature(day))
            for day in (today, today - timedelta(days=1))
        )
        if not given or not valid:
            raise ApiError("Not allowed.", code="forbidden", status_code=403)
        run = retention.run(trigger="schedule")
        return Response(
            {"run": str(run.id), "summary": run.summary, "ok": not run.error},
            status=200 if not run.error else 500,
        )

from django.db import connection
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from identity.models import RoleCode


@extend_schema(responses={200: OpenApiResponse(description="OK")})
class HealthzView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"})


@extend_schema(
    responses={
        200: OpenApiResponse(description="Ready"),
        503: OpenApiResponse(description="Not ready"),
    }
)
class ReadyzView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except Exception:
            return Response({"status": "not ready"}, status=503)
        return Response({"status": "ready"})


@extend_schema(responses={200: OpenApiResponse(description="Public platform constants")})
class PlatformConfigView(APIView):
    """Public constants and enums the frontend needs without hardcoding
    them twice (docs/04 §3.11)."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "roles": [{"code": c.value, "label": c.label} for c in RoleCode],
                "currency": "INR",
            }
        )

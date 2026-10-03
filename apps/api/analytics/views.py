"""docs/04 §3.10 analytics endpoints for the founders' weekly numbers.
Admin and Founder see the dashboard; the tiles that carry margins and
acquisition cost are Founder-only (docs/06 §2) and come back marked
`restricted` for Admin rather than as an error."""

from __future__ import annotations

from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

import territory.services as territory_services
from analytics import exports, metrics
from common import audit
from common.errors import ApiError
from common.permissions import IsAdminOrFounder

WEEK = OpenApiParameter("week", OpenApiTypes.DATE, description="Any day in the week (Mon–Sun).")
HUB = OpenApiParameter("hub", OpenApiTypes.UUID, required=False)


def _week(request):
    raw = request.query_params.get("week")
    day = parse_date(raw) if raw else timezone.localdate()
    if day is None:
        raise ApiError("'week' must be a date, e.g. 2026-10-05.", code="validation_error")
    return metrics.week_bounds(day)[0]


def _hub(request):
    return territory_services.resolve_hub(request)


def _is_founder(user) -> bool:
    return user.is_superuser or "FOUNDER" in user.role_codes


class WeeklyMetricsView(APIView):
    permission_classes = [IsAdminOrFounder]

    @extend_schema(parameters=[WEEK, HUB], responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        return Response(
            metrics.weekly(_hub(request), _week(request), include_money=_is_founder(request.user))
        )


class MetricRowsView(APIView):
    """The drill-down: the exact rows a tile was computed from."""

    permission_classes = [IsAdminOrFounder]

    @extend_schema(parameters=[WEEK, HUB], responses={200: OpenApiTypes.OBJECT})
    def get(self, request, key):
        if key not in metrics.METRICS:
            raise ApiError("Unknown metric.", code="not_found", status_code=404)
        if metrics.METRICS[key][2] and not _is_founder(request.user):
            raise ApiError("Founder only.", code="permission_denied", status_code=403)
        return Response(metrics.metric_rows(_hub(request), key, _week(request)))


class MetricCsvView(MetricRowsView):
    @extend_schema(parameters=[WEEK, HUB], responses={(200, "text/csv"): OpenApiTypes.STR})
    def get(self, request, key):
        if key not in metrics.METRICS:
            raise ApiError("Unknown metric.", code="not_found", status_code=404)
        if metrics.METRICS[key][2] and not _is_founder(request.user):
            raise ApiError("Founder only.", code="permission_denied", status_code=403)
        hub, week = _hub(request), _week(request)
        audit.record(
            action="analytics.export",
            object_type="Metric",
            object_id=key,
            hub=hub,
            after={"format": "csv", "week": str(week)},
            actor=request.user,
        )
        response = HttpResponse(exports.metric_csv(hub, key, week), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{key}-{week}.csv"'
        return response


class WeeklyExcelView(APIView):
    permission_classes = [IsAdminOrFounder]

    @extend_schema(
        parameters=[WEEK, HUB],
        responses={
            (
                200,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ): OpenApiTypes.BINARY
        },
    )
    def get(self, request):
        hub, week = _hub(request), _week(request)
        audit.record(
            action="analytics.export",
            object_type="WeeklyPack",
            object_id=str(week),
            hub=hub,
            after={"format": "xlsx", "week": str(week)},
            actor=request.user,
        )
        data = exports.weekly_workbook(
            hub,
            week,
            include_money=_is_founder(request.user),
            generated_by=request.user.full_name or request.user.email,
        )
        response = HttpResponse(
            data,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="ironman-weekly-{week}.xlsx"'
        return response

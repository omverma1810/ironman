"""docs/04 §3.10 analytics endpoints for the founders' weekly numbers.
Admin and Founder see the dashboard; the tiles that carry margins and
acquisition cost are Founder-only (docs/06 §2) and come back marked
`restricted` for Admin rather than as an error."""

from __future__ import annotations

from datetime import timedelta

from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

import territory.services as territory_services
from analytics import exports, metrics, quality, reports
from common import audit
from common.errors import ApiError
from common.permissions import IsAdminOrFounder, IsFounder, IsOpsStaff

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


PERIOD = [
    OpenApiParameter("from", OpenApiTypes.DATE, required=False),
    OpenApiParameter("to", OpenApiTypes.DATE, required=False),
    HUB,
]


def _period(request, default_days: int = 30):
    """`?from=&to=` (inclusive), defaulting to the last `default_days`."""
    today = timezone.localdate()
    end = parse_date(request.query_params.get("to") or "") or today
    start = parse_date(request.query_params.get("from") or "") or (
        end - timedelta(days=default_days - 1)
    )
    if start > end:
        raise ApiError("'from' must be on or before 'to'.", code="validation_error")
    return start, end


class ApartmentPerformanceView(APIView):
    """docs/08 batch 6.3. Admin sees the ranking without margins."""

    permission_classes = [IsAdminOrFounder]

    @extend_schema(parameters=PERIOD, responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        start, end = _period(request)
        rows = reports.apartment_performance(_hub(request), start, end)
        if not _is_founder(request.user):
            for row in rows:
                row.pop("margin_minor", None)
        return Response({"from": str(start), "to": str(end), "rows": rows})


class ChannelPerformanceView(APIView):
    """docs/08 batch 6.4 — carries acquisition cost, so Founder only."""

    permission_classes = [IsFounder]

    @extend_schema(parameters=PERIOD, responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        start, end = _period(request, 90)
        rows = reports.channel_performance(_hub(request), start, end)
        return Response({"from": str(start), "to": str(end), "rows": rows})


class UnitEconomicsView(APIView):
    """docs/08 batch 6.5 — margins, Founder only (docs/06 §2)."""

    permission_classes = [IsFounder]

    @extend_schema(parameters=PERIOD, responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        start, end = _period(request)
        return Response(
            {
                "from": str(start),
                "to": str(end),
                **reports.unit_economics(_hub(request), start, end),
            }
        )


class OperationsDailyView(APIView):
    """docs/08 batch 6.7 — operational analytics, open to every ops role."""

    permission_classes = [IsOpsStaff]

    @extend_schema(
        parameters=[OpenApiParameter("date", OpenApiTypes.DATE, required=False), HUB],
        responses={200: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        raw = request.query_params.get("date")
        day = parse_date(raw) if raw else None
        return Response(reports.operations_daily(_hub(request), day))


class CheckpointView(APIView):
    """docs/08 batch 6.6 — the Day 30/60/90 report as of any date."""

    permission_classes = [IsFounder]

    @extend_schema(
        parameters=[OpenApiParameter("as_of", OpenApiTypes.DATE, required=False), HUB],
        responses={200: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        raw = request.query_params.get("as_of")
        as_of = parse_date(raw) if raw else None
        return Response(reports.checkpoint(_hub(request), as_of))


class DataQualityView(APIView):
    """docs/08 batch 6.9 — the guardrails that say when a metric can't be
    trusted. Carries customer and payment rows, so Admin and Founder."""

    permission_classes = [IsAdminOrFounder]

    @extend_schema(parameters=[HUB], responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        return Response(quality.run(_hub(request)))


class WeeklyPdfView(APIView):
    """docs/07 §4.3 — the weekly pack, branded and print-ready."""

    permission_classes = [IsAdminOrFounder]

    @extend_schema(
        parameters=[WEEK, HUB], responses={(200, "application/pdf"): OpenApiTypes.BINARY}
    )
    def get(self, request):
        hub, week = _hub(request), _week(request)
        audit.record(
            action="analytics.export",
            object_type="WeeklyPack",
            object_id=str(week),
            hub=hub,
            after={"format": "pdf", "week": str(week)},
            actor=request.user,
        )
        data = exports.weekly_pdf(
            hub,
            week,
            include_money=_is_founder(request.user),
            generated_by=request.user.full_name or request.user.email,
        )
        response = HttpResponse(data, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="ironman-weekly-{week}.pdf"'
        return response

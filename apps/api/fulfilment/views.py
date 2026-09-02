"""docs/04 §3.6 (fulfilment endpoints, Phase 1.7). Route-day planning is
Admin/Founder-only (docs/06 §3.1's `[A]` tag = the `IsAdminOrFounder`
class, not `IsOpsStaff` — Operator is not in this row at all, unlike
custody's intake/scan endpoints). Job status updates and proofs follow the
"Update job status / proof" row exactly: Field own/assigned, Ops/Admin,
Founder — Operator is explicitly excluded there too, so it's
`HasRole.any("FIELD", "ADMIN", "FOUNDER")`, not `IsOpsStaff`. Field's "own"
scope (assigned_to=self, route_day.date within ±2 days — docs/06 §3.2) is
enforced in `JobViewSet.get_queryset`, the same pattern `ScopedQuerysetMixin`
uses for hub scoping.
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

import territory.services as territory_services
from common.permissions import HasRole, IsAdminOrFounder, IsFieldStaff
from fulfilment import services
from fulfilment.models import Job, RouteDay
from fulfilment.serializers import (
    JobAttemptSerializer,
    JobCompleteSerializer,
    JobFailSerializer,
    JobSerializer,
    OfflineOpResultSerializer,
    OfflineSyncSerializer,
    ProofCreateSerializer,
    ProofSerializer,
    RouteDayAssignSerializer,
    RouteDayCreateSerializer,
    RouteDayDetailSerializer,
    RouteDayListSerializer,
)

_CAN_ACT_ON_JOB = HasRole.any("FIELD", "ADMIN", "FOUNDER")


class RouteDayViewSet(viewsets.ModelViewSet):
    queryset = RouteDay.objects.filter(deleted_at__isnull=True).select_related("cluster", "hub")
    permission_classes = [IsAdminOrFounder]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["cluster", "date", "status"]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()
        if user.is_unrestricted:
            return qs
        return qs.filter(hub_id__in=user.hub_scope)

    def get_serializer_class(self):
        if self.action == "list":
            return RouteDayListSerializer
        if self.action == "assign":
            return RouteDayAssignSerializer
        return RouteDayDetailSerializer

    @extend_schema(request=RouteDayCreateSerializer, responses={201: RouteDayDetailSerializer})
    def create(self, request, *args, **kwargs):
        serializer = RouteDayCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        cluster = territory_services.get_cluster(data["cluster"])
        route_day = services.create_route_day(
            hub=cluster.hub, cluster=cluster, date=data["date"], actor=request.user
        )
        return Response(RouteDayDetailSerializer(route_day).data, status=201)

    @extend_schema(request=RouteDayAssignSerializer, responses={200: RouteDayDetailSerializer})
    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        route_day = self.get_object()
        serializer = RouteDayAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        route_day = services.assign_route_day(
            route_day, staff_ids=data["staff"], jobs=data["jobs"], actor=request.user
        )
        return Response(RouteDayDetailSerializer(route_day).data)


class JobViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = JobSerializer
    permission_classes = [_CAN_ACT_ON_JOB]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["route_day", "hub", "status", "kind", "assigned_to"]

    def get_queryset(self):
        user = self.request.user
        qs = Job.objects.filter(deleted_at__isnull=True).select_related(
            "order", "assigned_to", "route_day"
        )
        if not user.is_authenticated:
            return qs.none()
        if user.role_codes & {"ADMIN", "FOUNDER"}:
            return qs if user.is_unrestricted else qs.filter(hub_id__in=user.hub_scope)
        # Field staff: own jobs, ±2 days of today (docs/06 §3.2).
        today = timezone.localdate()
        return qs.filter(
            assigned_to=user,
            route_day__date__range=(today - timedelta(days=2), today + timedelta(days=2)),
        )

    @action(detail=False, methods=["get"], permission_classes=[IsFieldStaff])
    def mine(self, request):
        qs = self.get_queryset().filter(assigned_to=request.user)
        date_param = request.query_params.get("date")
        if date_param:
            qs = qs.filter(route_day__date=date_param)
        return Response(JobSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        job = services.start_job(self.get_object(), actor=request.user)
        return Response(JobSerializer(job).data)

    @action(detail=True, methods=["post"])
    def arrive(self, request, pk=None):
        job = services.arrive_job(self.get_object(), actor=request.user)
        return Response(JobSerializer(job).data)

    @extend_schema(request=JobCompleteSerializer, responses={200: JobSerializer})
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        serializer = JobCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        job = services.complete_job(
            self.get_object(),
            declared_lines=data.get("declared_lines"),
            bag_codes=data.get("bag_codes"),
            proof=data.get("proof"),
            actor=request.user,
        )
        return Response(JobSerializer(job).data)

    @extend_schema(request=JobFailSerializer, responses={200: JobSerializer})
    @action(detail=True, methods=["post"])
    def fail(self, request, pk=None):
        serializer = JobFailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        job = services.fail_job(
            self.get_object(),
            reason_code=data["reason_code"],
            note=data.get("note", ""),
            actor=request.user,
        )
        return Response(JobSerializer(job).data)

    @action(detail=True, methods=["get"])
    def attempts(self, request, pk=None):
        job = self.get_object()
        return Response(JobAttemptSerializer(job.attempts.all(), many=True).data)

    @action(detail=True, methods=["get"])
    def proofs(self, request, pk=None):
        job = self.get_object()
        return Response(ProofSerializer(job.proofs.all(), many=True).data)


@extend_schema(request=ProofCreateSerializer, responses={201: ProofSerializer})
class ProofCreateView(APIView):
    """POST /fulfilment/proofs — multipart (docs/04 §3.6). The only
    fulfilment endpoint that carries file bytes; job completion itself
    stays a plain JSON POST (see `JobCompleteSerializer`'s docstring)."""

    permission_classes = [_CAN_ACT_ON_JOB]

    def post(self, request):
        serializer = ProofCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        job = Job.objects.get(pk=data["job"])
        proof = services.record_proof(
            job,
            kind=data["kind"],
            file=data.get("file"),
            otp_verified=data.get("otp_verified", False),
            geo_lat=data.get("geo_lat"),
            geo_lng=data.get("geo_lng"),
        )
        return Response(ProofSerializer(proof).data, status=201)


@extend_schema(request=OfflineSyncSerializer, responses={200: OfflineOpResultSerializer(many=True)})
class OfflineSyncView(APIView):
    """POST /fulfilment/sync — batch offline queue replay (docs/04 §3.6,
    R-304). Each op gets its own applied/conflict/rejected result; one bad
    op in the batch never fails the rest (`fulfilment.services`'s
    per-operation try/except)."""

    permission_classes = [IsFieldStaff]

    def post(self, request):
        serializer = OfflineSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        results = [
            services.apply_offline_op(
                device_id=data["device_id"],
                staff=request.user,
                client_op_id=op["client_op_id"],
                op_type=op["op_type"],
                payload=op["payload"],
                client_ts=op["client_ts"],
            )
            for op in data["ops"]
        ]
        return Response(OfflineOpResultSerializer(results, many=True).data)

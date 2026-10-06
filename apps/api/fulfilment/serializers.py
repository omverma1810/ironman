from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

import ordering.services as ordering_services
from fulfilment.models import (
    Job,
    JobAttempt,
    JobKind,
    OfflineOp,
    Proof,
    ProofKind,
    RouteDay,
)

MAX_PROOF_BYTES = 10 * 1024 * 1024


class JobSerializer(serializers.ModelSerializer):
    order_ref = serializers.CharField(source="order.ref", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True)

    class Meta:
        model = Job
        fields = [
            "id",
            "route_day",
            "order",
            "order_ref",
            "kind",
            "sequence",
            "assigned_to",
            "assigned_to_name",
            "status",
            "slot_start",
            "slot_end",
            "started_at",
            "arrived_at",
            "completed_at",
            "attempt_no",
        ]
        read_only_fields = [f for f in fields if f != "sequence"]


class JobCardLineSerializer(serializers.Serializer):
    garment_type = serializers.UUIDField()
    garment_type_name = serializers.CharField()
    declared_qty = serializers.IntegerField()


class JobCardSerializer(JobSerializer):
    """What a rider needs on the doorstep, in one payload, so the field app
    can keep the whole day on the phone and work with no signal (docs/08
    batch 9.1). Only `GET /fulfilment/jobs/mine` uses it — the console's
    route-day views keep the lighter `JobSerializer`."""

    date = serializers.DateField(source="route_day.date", read_only=True)
    order_status = serializers.CharField(source="order.status", read_only=True)
    payment_status = serializers.CharField(source="order.payment_status", read_only=True)
    customer_name = serializers.CharField(source="order.customer.name", read_only=True)
    customer_phone = serializers.CharField(source="order.customer.phone", read_only=True)
    apartment_name = serializers.SerializerMethodField()
    address = serializers.SerializerMethodField()
    special_instructions = serializers.CharField(
        source="order.special_instructions", read_only=True
    )
    lines = serializers.SerializerMethodField()
    # How many bags go to this door: the rider scans each one, and the app can
    # say "2 of 3" without being told the codes themselves.
    bag_count = serializers.IntegerField(read_only=True)

    class Meta(JobSerializer.Meta):
        fields = JobSerializer.Meta.fields + [
            "date",
            "bag_count",
            "order_status",
            "payment_status",
            "customer_name",
            "customer_phone",
            "apartment_name",
            "address",
            "special_instructions",
            "lines",
        ]
        read_only_fields = fields

    @extend_schema_field(OpenApiTypes.STR)
    def get_apartment_name(self, obj) -> str:
        return obj.order.apartment.name if obj.order.apartment_id else ""

    @extend_schema_field(OpenApiTypes.STR)
    def get_address(self, obj) -> str:
        return ordering_services.address_text(obj.order.address) or ""

    @extend_schema_field(JobCardLineSerializer(many=True))
    def get_lines(self, obj):
        return [
            {
                "garment_type": line.garment_type_id,
                "garment_type_name": line.garment_type.name,
                "declared_qty": line.declared_qty,
            }
            for line in obj.order.lines.all()
        ]


class RouteDayListSerializer(serializers.ModelSerializer):
    cluster_name = serializers.CharField(source="cluster.name", read_only=True)
    job_count = serializers.SerializerMethodField()

    @extend_schema_field(OpenApiTypes.INT)
    def get_job_count(self, obj) -> int:
        # The list view annotates the count in its query; a single route day
        # (create, detail) just counts.
        annotated = getattr(obj, "annotated_job_count", None)
        return annotated if annotated is not None else obj.jobs.count()

    class Meta:
        model = RouteDay
        fields = [
            "id",
            "hub",
            "cluster",
            "cluster_name",
            "date",
            "status",
            "job_count",
            "created_at",
        ]


class RouteDayDetailSerializer(RouteDayListSerializer):
    jobs = JobSerializer(many=True, read_only=True)
    staff = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta(RouteDayListSerializer.Meta):
        fields = RouteDayListSerializer.Meta.fields + ["jobs", "staff"]


class RouteDayCreateSerializer(serializers.Serializer):
    cluster = serializers.UUIDField()
    date = serializers.DateField()


class JobAssignEntrySerializer(serializers.Serializer):
    order_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=JobKind.choices)
    assigned_to = serializers.UUIDField(required=False, allow_null=True)
    sequence = serializers.IntegerField(required=False, default=0)
    slot_start = serializers.DateTimeField(required=False, allow_null=True)
    slot_end = serializers.DateTimeField(required=False, allow_null=True)


class RouteDayAssignSerializer(serializers.Serializer):
    staff = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    jobs = serializers.ListField(child=JobAssignEntrySerializer(), allow_empty=False)


class DeclaredLineSerializer(serializers.Serializer):
    garment_type = serializers.UUIDField()
    qty = serializers.IntegerField(min_value=0)


class ProofMetaSerializer(serializers.Serializer):
    """Proof metadata embedded in a job-completion call — no file. A photo
    or signature image is uploaded separately via `POST /fulfilment/proofs`
    (multipart) so the hot-path completion call stays a plain JSON POST."""

    kind = serializers.ChoiceField(choices=ProofKind.choices)
    otp_verified = serializers.BooleanField(required=False, default=False)
    geo_lat = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True
    )
    geo_lng = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True
    )


class JobCompleteSerializer(serializers.Serializer):
    declared_lines = DeclaredLineSerializer(many=True, required=False, default=list)
    bag_codes = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    proof = ProofMetaSerializer(required=False, allow_null=True)


class JobFailSerializer(serializers.Serializer):
    reason_code = serializers.CharField(max_length=64)
    note = serializers.CharField(required=False, allow_blank=True, default="")
    # Accepted for shape-compatibility with docs/04 §3.6; acting on it means
    # picking a new pickup slot, which only `POST /orders/{ref}` reschedule
    # (an ops decision with a capacity to choose) can do — not implied by a
    # bare boolean, so this flag is informational only today.
    reschedule = serializers.BooleanField(required=False, default=False)


class ProofSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Proof
        fields = ["id", "job", "kind", "file_url", "otp_verified", "geo_lat", "geo_lng", "at"]

    def get_file_url(self, obj: Proof) -> str | None:
        if not obj.file:
            return None
        return obj.file.url


class ProofCreateSerializer(serializers.Serializer):
    """`POST /fulfilment/proofs` — multipart, the only fulfilment endpoint
    that carries file bytes (docs/04 §3.6)."""

    job = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=ProofKind.choices)
    file = serializers.FileField(required=False, allow_null=True)
    otp_verified = serializers.BooleanField(required=False, default=False)
    geo_lat = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True
    )
    geo_lng = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True
    )

    def validate_file(self, file):
        # A phone photo is a few MB; anything past this is not a proof photo.
        if file is not None:
            if file.size > MAX_PROOF_BYTES:
                raise serializers.ValidationError("That file is too large (10 MB at most).")
            content_type = getattr(file, "content_type", "") or ""
            if not content_type.startswith("image/"):
                raise serializers.ValidationError("A proof must be an image.")
        return file

    def validate(self, attrs):
        if attrs["kind"] in (ProofKind.PHOTO, ProofKind.SIGNATURE) and not attrs.get("file"):
            raise serializers.ValidationError(
                {"file": [f"A {attrs['kind'].lower()} proof needs a file."]}
            )
        return attrs


class JobAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobAttempt
        fields = ["id", "job", "attempt_no", "outcome", "failure_reason", "notes", "at"]


class OfflineOpItemSerializer(serializers.Serializer):
    client_op_id = serializers.CharField(max_length=64)
    op_type = serializers.CharField(max_length=32)
    payload = serializers.JSONField(default=dict)
    client_ts = serializers.DateTimeField()


class OfflineSyncSerializer(serializers.Serializer):
    device_id = serializers.CharField(max_length=128)
    ops = OfflineOpItemSerializer(many=True, allow_empty=False)


class OfflineOpResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = OfflineOp
        fields = ["client_op_id", "op_type", "status", "result_detail"]

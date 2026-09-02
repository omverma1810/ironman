from rest_framework import serializers

from fulfilment.models import (
    Job,
    JobAttempt,
    JobKind,
    OfflineOp,
    Proof,
    ProofKind,
    RouteDay,
)


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


class RouteDayListSerializer(serializers.ModelSerializer):
    cluster_name = serializers.CharField(source="cluster.name", read_only=True)
    job_count = serializers.IntegerField(source="jobs.count", read_only=True)

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

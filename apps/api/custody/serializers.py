import datetime

from rest_framework import serializers

from custody.models import Bag, GarmentLine, GarmentStage, QcCheck, StageEvent


class GarmentLineSerializer(serializers.ModelSerializer):
    garment_type_name = serializers.CharField(source="garment_type.name", read_only=True)
    bag_code = serializers.CharField(source="bag.code", read_only=True)
    order = serializers.UUIDField(source="bag.order_id", read_only=True)
    order_ref = serializers.CharField(source="bag.order.ref", read_only=True)
    delivery_promised_at = serializers.DateTimeField(
        source="bag.order.delivery_promised_at", read_only=True
    )
    # Only present when the queryset carries GarmentLineViewSet's
    # `stage_entered_at` annotation (production board ageing, docs/08 batch
    # 2.6) — falls back to `created_at` elsewhere (e.g. the scan/transition
    # response, or nested under BagDetailSerializer) rather than erroring on
    # a plain model instance with no such attribute.
    stage_entered_at = serializers.SerializerMethodField()

    def get_stage_entered_at(self, obj) -> datetime.datetime:
        return getattr(obj, "stage_entered_at", None) or obj.created_at

    class Meta:
        model = GarmentLine
        fields = [
            "id",
            "order_line",
            "bag",
            "bag_code",
            "order",
            "order_ref",
            "delivery_promised_at",
            "hub",
            "seq",
            "garment_type",
            "garment_type_name",
            "stage",
            "stage_entered_at",
            "condition_notes",
            "defect_flags",
            "is_rework",
            "rework_count",
            "created_at",
        ]
        read_only_fields = [f for f in fields if f not in ("condition_notes", "defect_flags")]


class BagListSerializer(serializers.ModelSerializer):
    order_ref = serializers.CharField(source="order.ref", read_only=True)
    garment_line_count = serializers.IntegerField(source="garment_lines.count", read_only=True)

    class Meta:
        model = Bag
        fields = [
            "id",
            "code",
            "order",
            "order_ref",
            "hub",
            "garment_count",
            "garment_line_count",
            "current_stage",
            "printed_at",
            "created_at",
        ]


class BagDetailSerializer(BagListSerializer):
    garment_lines = GarmentLineSerializer(many=True, read_only=True)

    class Meta(BagListSerializer.Meta):
        fields = BagListSerializer.Meta.fields + ["garment_lines"]


class BagCreateSerializer(serializers.Serializer):
    order_line_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=False
    )


class StageEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True)

    class Meta:
        model = StageEvent
        fields = [
            "id",
            "bag",
            "garment_line",
            "from_stage",
            "to_stage",
            "actor",
            "actor_name",
            "station",
            "scanned",
            "occurred_at",
            "device_id",
        ]


class BagScanSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    to_stage = serializers.ChoiceField(choices=GarmentStage.choices)
    station = serializers.CharField(max_length=64, required=False, allow_blank=True)
    device_id = serializers.CharField(max_length=128, required=False, allow_blank=True)
    scanned = serializers.BooleanField(default=True)


class ScanResultSerializer(serializers.Serializer):
    bag = BagDetailSerializer()
    moved_count = serializers.IntegerField()
    skipped_count = serializers.IntegerField()
    skipped = GarmentLineSerializer(many=True)


class GarmentTransitionSerializer(serializers.Serializer):
    to_stage = serializers.ChoiceField(choices=GarmentStage.choices)
    station = serializers.CharField(max_length=64, required=False, allow_blank=True)
    device_id = serializers.CharField(max_length=128, required=False, allow_blank=True)
    scanned = serializers.BooleanField(default=True)


class QcCheckSerializer(serializers.ModelSerializer):
    class Meta:
        model = QcCheck
        fields = ["id", "garment_line", "result", "reason", "checked_by", "at"]
        read_only_fields = ["checked_by", "at"]


class QcCheckCreateSerializer(serializers.Serializer):
    result = serializers.ChoiceField(choices=QcCheck.Result.choices)
    reason = serializers.CharField(required=False, allow_blank=True)
    scanned = serializers.BooleanField(default=True)
    device_id = serializers.CharField(max_length=128, required=False, allow_blank=True)

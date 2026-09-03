from rest_framework import serializers

from supplies.models import ConsumptionRule, StockItem, StockLevel, StockMovement


class StockItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockItem
        fields = [
            "id",
            "hub",
            "sku",
            "name",
            "unit",
            "category",
            "reorder_level",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class StockLevelSerializer(serializers.ModelSerializer):
    sku = serializers.CharField(source="stock_item.sku", read_only=True)
    name = serializers.CharField(source="stock_item.name", read_only=True)
    unit = serializers.CharField(source="stock_item.unit", read_only=True)
    reorder_level = serializers.IntegerField(source="stock_item.reorder_level", read_only=True)

    class Meta:
        model = StockLevel
        fields = [
            "id",
            "hub",
            "stock_item",
            "sku",
            "name",
            "unit",
            "reorder_level",
            "qty_on_hand",
            "avg_unit_cost_minor",
        ]
        read_only_fields = fields


class StockMovementSerializer(serializers.ModelSerializer):
    sku = serializers.CharField(source="stock_item.sku", read_only=True)
    actor_name = serializers.CharField(source="actor.name", read_only=True, default="")

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "hub",
            "stock_item",
            "sku",
            "delta_qty",
            "kind",
            "order",
            "unit_cost_minor",
            "supplier",
            "invoice_ref",
            "actor",
            "actor_name",
            "note",
            "at",
        ]
        read_only_fields = fields


class StockReceiptSerializer(serializers.Serializer):
    item = serializers.UUIDField()
    qty = serializers.IntegerField(min_value=1)
    unit_cost = serializers.IntegerField(min_value=0)
    supplier = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    invoice_ref = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class StockAdjustmentSerializer(serializers.Serializer):
    item = serializers.UUIDField()
    delta = serializers.IntegerField()
    kind = serializers.ChoiceField(choices=["ISSUE", "ADJUSTMENT", "WASTAGE", "RETURN"])
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class ConsumptionRuleSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source="service.name", read_only=True)
    garment_type_name = serializers.CharField(
        source="garment_type.name", read_only=True, default=""
    )
    stock_item_sku = serializers.CharField(source="stock_item.sku", read_only=True)

    class Meta:
        model = ConsumptionRule
        fields = [
            "id",
            "service",
            "service_name",
            "garment_type",
            "garment_type_name",
            "stock_item",
            "stock_item_sku",
            "qty_per_unit",
        ]
        read_only_fields = ["id"]
        extra_kwargs = {"garment_type": {"required": False, "allow_null": True}}
        # DRF auto-adds a UniqueTogetherValidator for the model's composite
        # constraint, which forces every field in it — including the
        # optional `garment_type` — to be "required" so it can run the
        # check. That check also assumes one instance being updated in
        # place; `ConsumptionRuleView.put` always creates fresh rows after
        # wiping the table, so the DB's own (soft-delete-scoped) constraint
        # is what actually enforces this, not this serializer.
        validators = []


class ConsumptionRuleReplaceSerializer(serializers.Serializer):
    rules = ConsumptionRuleSerializer(many=True)

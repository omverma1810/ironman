from rest_framework import serializers

from ordering.models import Channel, Order, OrderEvent, OrderException, OrderLine, ReQuote


class OrderLineSerializer(serializers.ModelSerializer):
    garment_type_name = serializers.CharField(source="garment_type.name", read_only=True)

    class Meta:
        model = OrderLine
        fields = [
            "id",
            "garment_type",
            "garment_type_name",
            "declared_qty",
            "verified_qty",
            "unit_price_minor",
            "line_total_minor",
            "notes",
        ]


class OrderListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    apartment_name = serializers.CharField(source="apartment.name", read_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)
    is_late_pickup = serializers.BooleanField(read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "ref",
            "status",
            "payment_status",
            "channel",
            "customer",
            "customer_name",
            "customer_phone",
            "apartment",
            "apartment_name",
            "service",
            "service_name",
            "pickup_slot_start",
            "pickup_slot_end",
            "delivery_slot_start",
            "delivery_slot_end",
            "declared_total_qty",
            "verified_total_qty",
            "total_minor",
            "created_at",
            "is_late_pickup",
        ]


class OrderDetailSerializer(OrderListSerializer):
    lines = OrderLineSerializer(many=True, read_only=True)

    class Meta(OrderListSerializer.Meta):
        fields = OrderListSerializer.Meta.fields + [
            "hub",
            "address",
            "subtotal_minor",
            "discount_minor",
            "tax_minor",
            "offers_applied",
            "notes",
            "special_instructions",
            "referral_code",
            "picked_up_at",
            "delivered_at",
            "pickup_promised_at",
            "delivery_promised_at",
            "cancelled_reason",
            "cancelled_at",
            "lines",
        ]


class OrderCreateSerializer(serializers.Serializer):
    hub = serializers.UUIDField()
    customer = serializers.UUIDField()
    service = serializers.UUIDField()
    address = serializers.UUIDField(required=False, allow_null=True)
    apartment = serializers.UUIDField(required=False, allow_null=True)
    channel = serializers.ChoiceField(choices=Channel.choices)
    pickup_capacity = serializers.UUIDField(required=False, allow_null=True)
    lines = serializers.ListField(child=serializers.DictField(), allow_empty=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    special_instructions = serializers.CharField(required=False, allow_blank=True)
    referral_code = serializers.CharField(required=False, allow_blank=True)


class OrderCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)


class OrderRescheduleSerializer(serializers.Serializer):
    pickup_capacity = serializers.UUIDField()


class OrderEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True)

    class Meta:
        model = OrderEvent
        fields = [
            "id",
            "event_type",
            "from_status",
            "to_status",
            "actor",
            "actor_name",
            "actor_role",
            "payload",
            "created_at",
        ]


class OrderIntakeSerializer(serializers.Serializer):
    verified_lines = serializers.ListField(child=serializers.DictField(), allow_empty=False)
    notes = serializers.CharField(required=False, allow_blank=True)


class ReQuoteSerializer(serializers.ModelSerializer):
    order_ref = serializers.CharField(source="order.ref", read_only=True)

    class Meta:
        model = ReQuote
        fields = [
            "id",
            "order",
            "order_ref",
            "reason",
            "old_total_minor",
            "new_total_minor",
            "decision",
            "sent_at",
            "decided_at",
        ]


class ReQuoteDecisionSerializer(serializers.Serializer):
    approved = serializers.BooleanField()


class OrderExceptionSerializer(serializers.ModelSerializer):
    order_ref = serializers.CharField(source="order.ref", read_only=True)
    raised_by_name = serializers.CharField(source="raised_by.full_name", read_only=True, default="")
    assigned_to_name = serializers.CharField(
        source="assigned_to.full_name", read_only=True, default=""
    )

    class Meta:
        model = OrderException
        fields = [
            "id",
            "order",
            "order_ref",
            "kind",
            "severity",
            "description",
            "raised_by",
            "raised_by_name",
            "assigned_to",
            "assigned_to_name",
            "sla_due_at",
            "status",
            "resolution",
            "cost_minor",
            "resolved_at",
            "created_at",
        ]
        read_only_fields = ["raised_by"]

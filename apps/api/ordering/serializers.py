from rest_framework import serializers

from ordering.models import Channel, Order, OrderEvent, OrderException, OrderLine, ReQuote
from ordering.stages import stage_for_status, stage_label_for_status


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
    # `Order.address` is a FK to `customers.Address` — left to a plain
    # ModelSerializer field this would just be the row's id (a UUID string,
    # useless to a field rider or a maps deep link), so it's resolved into
    # the text a human actually needs to find the door.
    address = serializers.SerializerMethodField()

    def get_address(self, obj: Order) -> str | None:
        addr = obj.address
        if not addr:
            return None
        parts: list[str] = []
        if addr.flat_no:
            parts.append(f"Flat {addr.flat_no}" + (f", Block {addr.block}" if addr.block else ""))
        if addr.apartment:
            parts.append(addr.apartment.name)
            if addr.apartment.address:
                parts.append(addr.apartment.address)
        elif addr.free_text_address:
            parts.append(addr.free_text_address)
        if addr.landmark:
            parts.append(f"Near {addr.landmark}")
        return ", ".join(parts) if parts else None

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
            # Ops can copy/share this manually until batch 4.2's
            # notification router sends it automatically — no incremental
            # exposure, since staff viewing an order already see everything
            # short of this credential itself.
            "tracking_token",
        ]


class OrderCreateSerializer(serializers.Serializer):
    hub = serializers.UUIDField()
    # Required for a staff caller (who is booking on someone else's
    # behalf), but never trusted from a customer caller — the view
    # derives their own identity from `request.user` instead, since
    # nothing here is proof they own this id (see
    # `customers.services.get_or_create_customer_for_user`). Optional at
    # the serializer level so a customer's own first booking, which has
    # no customer id yet, validates at all.
    customer = serializers.UUIDField(required=False, allow_null=True)
    service = serializers.UUIDField()
    # An existing saved address (staff always; a returning customer
    # picking a saved one) — ownership is verified for a customer-role
    # caller (`customers.services.get_or_create_address_for_customer`),
    # never trusted at face value. A first-time customer instead sends the
    # flat_no/block/landmark/free_text_address fields below and a new
    # Address is created for them on the spot.
    address = serializers.UUIDField(required=False, allow_null=True)
    flat_no = serializers.CharField(required=False, allow_blank=True, max_length=32)
    block = serializers.CharField(required=False, allow_blank=True, max_length=32)
    landmark = serializers.CharField(required=False, allow_blank=True, max_length=160)
    free_text_address = serializers.CharField(required=False, allow_blank=True)
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


class PublicOrderEventSerializer(serializers.ModelSerializer):
    """The `/track/{token}` timeline — deliberately narrower than
    `OrderEventSerializer`: no `actor`/`actor_name` (a staff member's name)
    and no `payload` (may carry internal detail like exception notes)."""

    stage = serializers.SerializerMethodField()

    class Meta:
        model = OrderEvent
        fields = ["event_type", "to_status", "stage", "created_at"]

    def get_stage(self, obj: OrderEvent) -> str | None:
        return stage_for_status(obj.to_status) if obj.to_status else None


class PublicOrderTrackingSerializer(serializers.ModelSerializer):
    """The public, unauthenticated view behind a tracking link (docs/01 §4b
    C-3, batch 4.1) — reachable by anyone holding the token, so this must
    never include anything beyond what the order's own customer already
    knows: no phone/email, no other customers' data, no internal cost or
    staff detail."""

    stage = serializers.SerializerMethodField()
    stage_label = serializers.SerializerMethodField()
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)
    address = serializers.SerializerMethodField()
    lines = OrderLineSerializer(many=True, read_only=True)
    invoice = serializers.SerializerMethodField()
    events = PublicOrderEventSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "ref",
            "status",
            "stage",
            "stage_label",
            "payment_status",
            "customer_name",
            "service_name",
            "address",
            "pickup_slot_start",
            "pickup_slot_end",
            "delivery_slot_start",
            "delivery_slot_end",
            "pickup_promised_at",
            "delivery_promised_at",
            "picked_up_at",
            "delivered_at",
            "declared_total_qty",
            "verified_total_qty",
            "total_minor",
            "lines",
            "invoice",
            "events",
            "created_at",
        ]

    def get_stage(self, obj: Order) -> str:
        return stage_for_status(obj.status)

    def get_stage_label(self, obj: Order) -> str:
        return stage_label_for_status(obj.status)

    def get_address(self, obj: Order) -> str | None:
        addr = obj.address
        if not addr:
            return None
        parts: list[str] = []
        if addr.flat_no:
            parts.append(f"Flat {addr.flat_no}" + (f", Block {addr.block}" if addr.block else ""))
        if addr.apartment:
            parts.append(addr.apartment.name)
        elif addr.free_text_address:
            parts.append(addr.free_text_address)
        return ", ".join(parts) if parts else None

    def get_invoice(self, obj: Order) -> dict | None:
        invoice = getattr(obj, "invoice", None)
        # Compared as a plain string, not `billing.models.InvoiceStatus.DRAFT`
        # — `ordering` may not import `billing.models` (docs/03 §3.1's
        # views-only-through-services boundary, setup.cfg's import-linter
        # contract).
        if not invoice or invoice.status == "DRAFT":
            return None
        return {
            "ref": invoice.ref,
            "status": invoice.status,
            "issued_at": invoice.issued_at,
            "total_minor": invoice.total_minor,
            "pdf_url": invoice.pdf_file.url if invoice.pdf_file else None,
        }

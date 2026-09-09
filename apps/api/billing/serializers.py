from rest_framework import serializers

from billing.models import CashDeposit, CashHandover, CreditNote, Invoice, Payment


class InvoiceListSerializer(serializers.ModelSerializer):
    order_ref = serializers.CharField(source="order.ref", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    paid_minor = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "ref",
            "hub",
            "order",
            "order_ref",
            "customer_name",
            "status",
            "issued_at",
            "total_minor",
            "gst_applied",
            "paid_minor",
        ]
        read_only_fields = fields

    def get_paid_minor(self, obj: Invoice) -> int:
        # Same "SUCCEEDED-only" sum as `InvoiceDetailSerializer` — the
        # order-detail page's Invoice section renders from this list
        # response (`InvoiceViewSet.get_queryset(order=...)`), not the
        # detail one, and needs the balance to decide whether "Record
        # payment" should still show.
        return sum(p.amount_minor for p in obj.payments.all() if p.status == "SUCCEEDED")


class CreditNoteSerializer(serializers.ModelSerializer):
    issued_by_name = serializers.CharField(source="issued_by.full_name", read_only=True, default="")
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = CreditNote
        fields = ["id", "invoice", "reason", "amount_minor", "issued_by_name", "at", "pdf_url"]
        read_only_fields = fields

    def get_pdf_url(self, obj: CreditNote) -> str | None:
        return obj.pdf_file.url if obj.pdf_file else None


class PaymentSerializer(serializers.ModelSerializer):
    collected_by_name = serializers.CharField(
        source="collected_by.full_name", read_only=True, default=""
    )

    class Meta:
        model = Payment
        fields = [
            "id",
            "invoice",
            "method",
            "amount_minor",
            "status",
            "gateway_ref",
            "collected_by_name",
            "at",
        ]
        read_only_fields = fields


class InvoiceDetailSerializer(serializers.ModelSerializer):
    order_ref = serializers.CharField(source="order.ref", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    hub_name = serializers.CharField(source="hub.name", read_only=True)
    pdf_url = serializers.SerializerMethodField()
    credit_notes = CreditNoteSerializer(many=True, read_only=True)
    credited_minor = serializers.SerializerMethodField()
    payments = PaymentSerializer(many=True, read_only=True)
    paid_minor = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "ref",
            "hub",
            "hub_name",
            "order",
            "order_ref",
            "customer",
            "customer_name",
            "customer_phone",
            "status",
            "issued_at",
            "subtotal_minor",
            "discount_minor",
            "tax_minor",
            "total_minor",
            "gst_applied",
            "gstin_snapshot",
            "price_list_version",
            "snapshot",
            "pdf_url",
            "credit_notes",
            "credited_minor",
            "payments",
            "paid_minor",
        ]
        read_only_fields = fields

    def get_pdf_url(self, obj: Invoice) -> str | None:
        return obj.pdf_file.url if obj.pdf_file else None

    def get_credited_minor(self, obj: Invoice) -> int:
        return sum(cn.amount_minor for cn in obj.credit_notes.all())

    def get_paid_minor(self, obj: Invoice) -> int:
        return sum(p.amount_minor for p in obj.payments.all() if p.status == "SUCCEEDED")


class IssueInvoiceSerializer(serializers.Serializer):
    apply_gst = serializers.BooleanField(required=False, allow_null=True, default=None)


class CreditNoteCreateSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)
    # Minor units on the wire (paise) — same convention as
    # `supplies.StockReceiptSerializer`'s `unit_cost`.
    amount = serializers.IntegerField(min_value=1)


class RecordPaymentSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=["CASH", "UPI_QR", "ADJUSTMENT"])
    # Minor units (paise) on the wire, same convention as `amount` above.
    amount = serializers.IntegerField(min_value=1)
    idempotency_key = serializers.CharField(max_length=64)
    gateway_ref = serializers.CharField(max_length=64, required=False, allow_blank=True)


class CashBalanceSerializer(serializers.Serializer):
    balance_minor = serializers.IntegerField()


class CashHandoverSerializer(serializers.ModelSerializer):
    from_user_name = serializers.CharField(source="from_user.full_name", read_only=True)
    to_user_name = serializers.CharField(source="to_user.full_name", read_only=True)
    confirmed_by_name = serializers.CharField(
        source="confirmed_by.full_name", read_only=True, default=""
    )

    class Meta:
        model = CashHandover
        fields = [
            "id",
            "hub",
            "from_user",
            "from_user_name",
            "to_user",
            "to_user_name",
            "declared_amount_minor",
            "received_amount_minor",
            "variance_minor",
            "variance_note",
            "status",
            "confirmed_by_name",
            "confirmed_at",
            "created_at",
        ]
        read_only_fields = fields


class InitiateHandoverSerializer(serializers.Serializer):
    to_user = serializers.UUIDField()
    # Minor units (paise) on the wire, same convention as every other
    # money field in this app.
    amount = serializers.IntegerField(min_value=1)


class ConfirmHandoverSerializer(serializers.Serializer):
    received_amount = serializers.IntegerField(min_value=0)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class CashDepositSerializer(serializers.ModelSerializer):
    deposited_by_name = serializers.CharField(
        source="deposited_by.full_name", read_only=True, default=""
    )

    class Meta:
        model = CashDeposit
        fields = [
            "id",
            "hub",
            "amount_minor",
            "deposited_by_name",
            "reference",
            "notes",
            "at",
        ]
        read_only_fields = fields


class CreateDepositSerializer(serializers.Serializer):
    amount = serializers.IntegerField(min_value=1)
    reference = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class HandoverRecipientSerializer(serializers.Serializer):
    """A minimal picker shape for `InitiateHandoverSerializer.to_user` —
    scoped to this app rather than reusing `identity.StaffSerializer`,
    since the eligible-recipient set here (ops staff at the rider's hub,
    plus any founder) is a cash-custody concern, not a general staff list
    (that one stays Admin/Founder-only, docs/06 §3.1)."""

    id = serializers.UUIDField()
    full_name = serializers.CharField()
    email = serializers.CharField()


class CashReconciliationRowSerializer(serializers.Serializer):
    rider_id = serializers.UUIDField()
    rider_name = serializers.CharField()
    collected_minor = serializers.IntegerField()
    declared_minor = serializers.IntegerField()
    received_minor = serializers.IntegerField()
    variance_minor = serializers.IntegerField()
    outstanding_minor = serializers.IntegerField()
    pending_handovers = serializers.IntegerField()

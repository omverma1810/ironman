from rest_framework import serializers

from billing.models import CreditNote, Invoice


class InvoiceListSerializer(serializers.ModelSerializer):
    order_ref = serializers.CharField(source="order.ref", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)

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
        ]
        read_only_fields = fields


class CreditNoteSerializer(serializers.ModelSerializer):
    issued_by_name = serializers.CharField(source="issued_by.full_name", read_only=True, default="")
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = CreditNote
        fields = ["id", "invoice", "reason", "amount_minor", "issued_by_name", "at", "pdf_url"]
        read_only_fields = fields

    def get_pdf_url(self, obj: CreditNote) -> str | None:
        return obj.pdf_file.url if obj.pdf_file else None


class InvoiceDetailSerializer(serializers.ModelSerializer):
    order_ref = serializers.CharField(source="order.ref", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    hub_name = serializers.CharField(source="hub.name", read_only=True)
    pdf_url = serializers.SerializerMethodField()
    credit_notes = CreditNoteSerializer(many=True, read_only=True)
    credited_minor = serializers.SerializerMethodField()

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
        ]
        read_only_fields = fields

    def get_pdf_url(self, obj: Invoice) -> str | None:
        return obj.pdf_file.url if obj.pdf_file else None

    def get_credited_minor(self, obj: Invoice) -> int:
        return sum(cn.amount_minor for cn in obj.credit_notes.all())


class IssueInvoiceSerializer(serializers.Serializer):
    apply_gst = serializers.BooleanField(required=False, allow_null=True, default=None)


class CreditNoteCreateSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)
    # Minor units on the wire (paise) — same convention as
    # `supplies.StockReceiptSerializer`'s `unit_cost`.
    amount = serializers.IntegerField(min_value=1)

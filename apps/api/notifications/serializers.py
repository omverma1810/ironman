from rest_framework import serializers

from notifications.models import (
    NotificationChannel,
    NotificationDelivery,
    NotificationRequest,
)


class NotificationPreferenceSerializer(serializers.Serializer):
    channel = serializers.ChoiceField(choices=NotificationChannel.choices)
    opted_in = serializers.BooleanField()


class NotificationDeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationDelivery
        fields = [
            "id",
            "provider",
            "provider_message_id",
            "status",
            "error",
            "cost_minor",
            "created_at",
        ]


class NotificationRequestSerializer(serializers.ModelSerializer):
    order_ref = serializers.CharField(source="order.ref", read_only=True, default="")
    template_code = serializers.CharField(source="template.code", read_only=True)
    deliveries = NotificationDeliverySerializer(many=True, read_only=True)

    class Meta:
        model = NotificationRequest
        fields = [
            "id",
            "order",
            "order_ref",
            "template_code",
            "channel",
            "recipient_kind",
            "recipient_id",
            "status",
            "skipped_reason",
            "created_at",
            "deliveries",
        ]


class NotificationTestSerializer(serializers.Serializer):
    event_key = serializers.CharField()
    order = serializers.UUIDField()

from rest_framework import serializers

from growth.models import Feedback


class FeedbackCreateSerializer(serializers.Serializer):
    order = serializers.UUIDField()
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True)
    tags = serializers.ListField(child=serializers.CharField(), required=False)


class FeedbackSerializer(serializers.ModelSerializer):
    order_ref = serializers.CharField(source="order.ref", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)

    class Meta:
        model = Feedback
        fields = [
            "id",
            "order",
            "order_ref",
            "customer_name",
            "rating",
            "comment",
            "tags",
            "is_public",
            "responded_by",
            "responded_at",
            "created_at",
        ]
        read_only_fields = [f for f in fields if f != "is_public"]


class FeedbackModerateSerializer(serializers.Serializer):
    is_public = serializers.BooleanField()

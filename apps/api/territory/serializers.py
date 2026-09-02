from rest_framework import serializers

from territory.models import Apartment, ApartmentContact, Cluster, Hub, RouteDayCapacity


class HubSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hub
        fields = [
            "id",
            "code",
            "name",
            "address",
            "timezone",
            "cutoff_time",
            "daily_pressing_capacity",
            "is_active",
        ]


class ClusterSerializer(serializers.ModelSerializer):
    hub_code = serializers.CharField(source="hub.code", read_only=True)

    class Meta:
        model = Cluster
        fields = ["id", "hub", "hub_code", "name", "notes", "is_active"]


class ApartmentContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApartmentContact
        fields = ["id", "apartment", "kind", "name", "phone", "notes"]


class ApartmentSerializer(serializers.ModelSerializer):
    cluster_name = serializers.CharField(source="cluster.name", read_only=True)
    contacts = ApartmentContactSerializer(many=True, read_only=True)

    class Meta:
        model = Apartment
        fields = [
            "id",
            "cluster",
            "cluster_name",
            "name",
            "address",
            "pincode",
            "gate_notes",
            "is_active",
            "launched_on",
            "contacts",
        ]


class ApartmentPublicSerializer(serializers.ModelSerializer):
    """Minimal fields for the public booking search (docs/04 §3.2) — no
    gate notes or contacts exposed pre-authentication."""

    class Meta:
        model = Apartment
        fields = ["id", "name", "cluster"]


class RouteDayCapacitySerializer(serializers.ModelSerializer):
    available = serializers.IntegerField(read_only=True)

    class Meta:
        model = RouteDayCapacity
        fields = [
            "id",
            "hub",
            "cluster",
            "date",
            "window_start",
            "window_end",
            "kind",
            "capacity",
            "booked_count",
            "available",
        ]
        read_only_fields = ["booked_count"]

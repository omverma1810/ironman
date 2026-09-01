"""Territory (docs/02 §3.2). Hub → Cluster → Apartment is the geography the
whole platform is dimensioned by — every operational fact traces back to
an apartment, because that is the unit the founders make expansion
decisions about (docs/01 §1)."""

from __future__ import annotations

from django.db import models

from common.models import BaseModel


class Hub(BaseModel):
    """A physical store/pressing location. Not itself hub-scoped — it IS
    the scope (ADR-013: multi-hub-ready schema, single-tenant product)."""

    code = models.CharField(max_length=16, unique=True)
    name = models.CharField(max_length=120)
    address = models.TextField(blank=True)
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    cutoff_time = models.TimeField(default="21:00")
    # D-17: not a fixed platform constant — an admin-tunable starting
    # point, raised week over week as the pilot proves out real throughput.
    daily_pressing_capacity = models.PositiveIntegerField(default=150)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "territory_hub"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class TaxSettings(models.Model):
    """D-04: GST is admin-configurable per hub, not fixed for v1 — the
    founders decide whether to charge it, and an ops/admin user can still
    override per invoice at issue time (see `billing` in a later phase)."""

    hub = models.OneToOneField(Hub, on_delete=models.CASCADE, related_name="tax_settings")
    gst_enabled = models.BooleanField(default=False)
    gstin = models.CharField(max_length=15, blank=True)
    default_rate_bps = models.PositiveIntegerField(default=0)  # basis points, e.g. 1800 = 18%
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "territory_tax_settings"

    def __str__(self) -> str:
        return f"Tax settings — {self.hub}"


class Cluster(BaseModel):
    hub = models.ForeignKey(Hub, on_delete=models.PROTECT, related_name="clusters")
    name = models.CharField(max_length=120)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "territory_cluster"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["hub", "name"], name="uniq_cluster_hub_name")
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.hub.code})"


class Apartment(BaseModel):
    cluster = models.ForeignKey(Cluster, on_delete=models.PROTECT, related_name="apartments")
    name = models.CharField(max_length=160)
    address = models.TextField(blank=True)
    pincode = models.CharField(max_length=10, blank=True, db_index=True)
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    gate_notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    # docs/07 §2⑥ — an apartment live for 5 days is not comparable to one
    # live for 60; this is what makes the apartment ranking fair.
    launched_on = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "territory_apartment"
        ordering = ["name"]
        indexes = [models.Index(fields=["pincode"])]

    def __str__(self) -> str:
        return self.name


class ApartmentContact(BaseModel):
    class Kind(models.TextChoices):
        WATCHMAN = "WATCHMAN", "Watchman / Security"
        MANAGER = "MANAGER", "Property Manager"
        RWA = "RWA", "Resident Welfare Association"

    apartment = models.ForeignKey(Apartment, on_delete=models.CASCADE, related_name="contacts")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "territory_apartment_contact"

    def __str__(self) -> str:
        return f"{self.name} ({self.get_kind_display()}) — {self.apartment}"


class ServiceArea(BaseModel):
    """Pincode-based serviceability lookup for the public booking flow
    (docs/04 §3.2, R-602)."""

    hub = models.ForeignKey(Hub, on_delete=models.CASCADE, related_name="service_areas")
    pincode = models.CharField(max_length=10, db_index=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "territory_service_area"
        constraints = [models.UniqueConstraint(fields=["hub", "pincode"], name="uniq_service_area")]


class RouteDayCapacity(BaseModel):
    """Slots are inventory (ADR-009). Capacity per cluster, per day, per
    window/kind — decremented under a row lock at booking so two customers
    can never take the last slot (docs/02 §5)."""

    class Kind(models.TextChoices):
        PICKUP = "PICKUP", "Pickup"
        DELIVERY = "DELIVERY", "Delivery"

    hub = models.ForeignKey(Hub, on_delete=models.CASCADE, related_name="+")
    cluster = models.ForeignKey(Cluster, on_delete=models.CASCADE, related_name="capacities")
    date = models.DateField()
    window_start = models.TimeField()
    window_end = models.TimeField()
    kind = models.CharField(max_length=16, choices=Kind.choices)
    capacity = models.PositiveIntegerField(default=12)
    booked_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "territory_route_day_capacity"
        ordering = ["date", "window_start"]
        constraints = [
            models.UniqueConstraint(
                fields=["cluster", "date", "window_start", "kind"],
                name="uniq_capacity_slot",
            ),
            models.CheckConstraint(
                condition=models.Q(booked_count__lte=models.F("capacity")),
                name="capacity_not_exceeded",
            ),
        ]

    @property
    def available(self) -> int:
        return max(self.capacity - self.booked_count, 0)

    def __str__(self) -> str:
        return f"{self.cluster} {self.date} {self.window_start}-{self.window_end} ({self.kind})"

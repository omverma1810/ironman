"""Catalog & pricing (docs/02 §3.3, ADR-005). PriceList is effective-dated
and immutable once active — the client said pricing would be tested and
changed; mutating a price row would make every historical invoice
unreproducible."""

from __future__ import annotations

from django.db import models

from common.models import BaseModel


class Service(BaseModel):
    """R-805: an extensible catalogue — the client named sneaker cleaning
    as the likely next service, and this must not require a re-model."""

    class Unit(models.TextChoices):
        PER_ITEM = "PER_ITEM", "Per item"
        PER_KG = "PER_KG", "Per kilogram"
        PER_PAIR = "PER_PAIR", "Per pair"

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    unit = models.CharField(max_length=16, choices=Unit.choices, default=Unit.PER_ITEM)
    sla_hours = models.PositiveIntegerField(default=24)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "catalog_service"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class GarmentType(BaseModel):
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="garment_types")
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=120)
    default_press_seconds = models.PositiveIntegerField(default=120)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "catalog_garment_type"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["service", "code"], name="uniq_garment_type_code")
        ]

    def __str__(self) -> str:
        return self.name


class PriceList(BaseModel):
    """ADR-005: immutable once ACTIVE or SUPERSEDED. A new price = a new
    version with a new effective_from, never an edit of an existing row."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        SUPERSEDED = "SUPERSEDED", "Superseded"

    hub = models.ForeignKey("territory.Hub", on_delete=models.CASCADE, related_name="price_lists")
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="price_lists")
    version = models.PositiveIntegerField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    effective_from = models.DateTimeField(null=True, blank=True)
    effective_to = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "catalog_price_list"
        ordering = ["-version"]
        constraints = [
            models.UniqueConstraint(
                fields=["hub", "service", "version"], name="uniq_price_list_version"
            )
        ]

    def __str__(self) -> str:
        return f"{self.service.code} v{self.version} ({self.status}) — {self.hub.code}"

    def is_immutable(self) -> bool:
        return self.status in (self.Status.ACTIVE, self.Status.SUPERSEDED)


class PriceLine(BaseModel):
    price_list = models.ForeignKey(PriceList, on_delete=models.CASCADE, related_name="lines")
    garment_type = models.ForeignKey(GarmentType, on_delete=models.PROTECT, related_name="+")
    unit_price_minor = models.BigIntegerField()
    min_qty = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "catalog_price_line"
        constraints = [
            models.UniqueConstraint(fields=["price_list", "garment_type"], name="uniq_price_line")
        ]

    def __str__(self) -> str:
        return f"{self.garment_type.name} @ {self.unit_price_minor}p"

    def save(self, *args, **kwargs):
        # UUID pks are assigned client-side (common.id.new_uuid7), so
        # `self.pk` is truthy even on a brand-new row — check existence in
        # the DB instead of pk-truthiness to tell an update from an insert.
        is_update = PriceLine.objects.filter(pk=self.pk).exists()
        if is_update and self.price_list.is_immutable():
            raise RuntimeError(
                "Cannot edit a price line on an ACTIVE/SUPERSEDED price list. "
                "Create a new version instead (ADR-005)."
            )
        super().save(*args, **kwargs)


class Offer(BaseModel):
    """Dated and rule-based, never a bare percentage hardcoded in a view
    (docs/02 §3.3)."""

    class Kind(models.TextChoices):
        FIRST_ORDER = "FIRST_ORDER", "First order discount"
        REFERRAL_CREDIT = "REFERRAL_CREDIT", "Referral credit"
        APARTMENT_PROMO = "APARTMENT_PROMO", "Apartment promotion"
        FLAT = "FLAT", "Flat discount"
        PERCENT = "PERCENT", "Percent discount"

    code = models.CharField(max_length=32, unique=True)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    value_bps = models.PositiveIntegerField(
        default=0, help_text="Basis points for PERCENT; ignored otherwise"
    )
    value_minor = models.BigIntegerField(default=0, help_text="Minor units for FLAT/credit offers")
    cap_minor = models.BigIntegerField(null=True, blank=True)
    apartment = models.ForeignKey(
        "territory.Apartment", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    effective_from = models.DateTimeField()
    effective_to = models.DateTimeField(null=True, blank=True)
    max_redemptions = models.PositiveIntegerField(null=True, blank=True)
    redemptions_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "catalog_offer"

    def __str__(self) -> str:
        return self.code

    def is_valid_now(self) -> bool:
        from django.utils import timezone

        now = timezone.now()
        if not self.is_active:
            return False
        if now < self.effective_from:
            return False
        if self.effective_to and now > self.effective_to:
            return False
        if self.max_redemptions and self.redemptions_count >= self.max_redemptions:
            return False
        return True


class Package(BaseModel):
    """R-111 / A-07: modelled now, no UI ships in v1 — the client said
    packages would be tested later; the pricing engine must not preclude
    it (docs/00 §3.3 P-3)."""

    class Cycle(models.TextChoices):
        WEEKLY = "WEEKLY", "Weekly"
        MONTHLY = "MONTHLY", "Monthly"

    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="packages")
    name = models.CharField(max_length=120)
    cycle = models.CharField(max_length=16, choices=Cycle.choices)
    included_qty = models.PositiveIntegerField()
    price_minor = models.BigIntegerField()
    effective_from = models.DateTimeField()
    effective_to = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "catalog_package"

    def __str__(self) -> str:
        return self.name

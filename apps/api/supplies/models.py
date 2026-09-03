"""Supplies (docs/02 §3.9) — the missing inventory (`G-2`). `StockMovement`
is the ledger and the only source of truth, append-only like
`custody.StageEvent`; `StockLevel` is a derived running balance kept in
sync by `supplies.services` the same way `custody.Bag.current_stage` is a
cache of its `StageEvent` history.

The domain model (docs/02 §3.9) also lists a `StockBatch` row alongside
`StockMovement` — `stock_item, qty_received, unit_cost_minor, received_on,
supplier, invoice_ref`. Every one of those fields is already carried by a
RECEIPT-kind `StockMovement` here, and this batch has no lot/FIFO costing
feature that would need a batch to outlive its movement, so a separate
table would just be the same six columns twice. Folded in below; worth
splitting out the day lot-costing is actually built.
"""

from __future__ import annotations

from django.db import models
from django.utils import timezone

from common.models import AppendOnlyModel, BaseModel, HubScopedModel


class StockUnit(models.TextChoices):
    PIECE = "PIECE", "Piece"
    LITRE = "LITRE", "Litre"
    KG = "KG", "Kilogram"
    ROLL = "ROLL", "Roll"


class StockCategory(models.TextChoices):
    HANGER = "HANGER", "Hanger"
    COVER = "COVER", "Poly cover"
    BAG = "BAG", "Bag"
    CHEMICAL = "CHEMICAL", "Chemical"
    SPARE = "SPARE", "Spare part"
    OTHER = "OTHER", "Other"


class StockItem(HubScopedModel):
    sku = models.CharField(max_length=32)
    name = models.CharField(max_length=120)
    unit = models.CharField(max_length=8, choices=StockUnit.choices, default=StockUnit.PIECE)
    category = models.CharField(max_length=16, choices=StockCategory.choices)
    reorder_level = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "supplies_stock_item"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["hub", "sku"], name="uniq_supplies_stockitem_hub_sku")
        ]

    def __str__(self) -> str:
        return f"{self.sku} — {self.name}"


class StockLevel(HubScopedModel):
    """One row per `StockItem`, created lazily the first time a movement
    touches that item (`services._apply_movement`) — never written to
    directly outside that function."""

    stock_item = models.OneToOneField(StockItem, on_delete=models.CASCADE, related_name="level")
    qty_on_hand = models.IntegerField(default=0)
    avg_unit_cost_minor = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "supplies_stock_level"

    def __str__(self) -> str:
        return f"{self.stock_item.sku}: {self.qty_on_hand}"


class MovementKind(models.TextChoices):
    RECEIPT = "RECEIPT", "Receipt"
    ISSUE = "ISSUE", "Issue"
    ADJUSTMENT = "ADJUSTMENT", "Adjustment"
    WASTAGE = "WASTAGE", "Wastage"
    RETURN = "RETURN", "Return"


# Kinds POST /supplies/adjustments may write — RECEIPT has its own
# endpoint (it always carries a unit cost, for the weighted-average
# recalculation `services.receive_stock` does).
ADJUSTMENT_KINDS = frozenset(
    {MovementKind.ISSUE, MovementKind.ADJUSTMENT, MovementKind.WASTAGE, MovementKind.RETURN}
)


class StockMovement(AppendOnlyModel):
    """The ledger. `delta_qty` is signed: positive for RECEIPT/RETURN,
    negative for ISSUE/WASTAGE, either sign for a correcting ADJUSTMENT —
    `services.adjust_stock` enforces which. `StockLevel.qty_on_hand` is
    always this table's running sum for the item; nothing else may move
    it."""

    stock_item = models.ForeignKey(StockItem, on_delete=models.PROTECT, related_name="movements")
    hub = models.ForeignKey("territory.Hub", on_delete=models.PROTECT, related_name="+")
    delta_qty = models.IntegerField()
    kind = models.CharField(max_length=16, choices=MovementKind.choices)
    order = models.ForeignKey(
        "ordering.Order", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    unit_cost_minor = models.PositiveIntegerField(null=True, blank=True)
    supplier = models.CharField(max_length=120, blank=True)
    invoice_ref = models.CharField(max_length=64, blank=True)
    actor = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    note = models.CharField(max_length=255, blank=True)
    at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "supplies_stock_movement"
        indexes = [
            models.Index(fields=["stock_item", "-at"]),
            models.Index(fields=["hub", "-at"]),
        ]

    def __str__(self) -> str:
        return f"{self.stock_item.sku} {self.kind} {self.delta_qty:+d}"


class ConsumptionRule(BaseModel):
    """docs/02 §3.9: "1 hanger + 1 poly cover per shirt" — what a rule
    engine would need to auto-issue stock on `PACKED` and write the
    matching `OrderCost`. `OrderCost` lives in `billing`, which docs/08's
    Phase 3 hasn't built yet, so this batch stops at the rule table +
    CRUD: the data operators need to define now, wired to an automatic
    issue once billing exists to receive the cost side of it."""

    service = models.ForeignKey(
        "catalog.Service", on_delete=models.CASCADE, related_name="consumption_rules"
    )
    garment_type = models.ForeignKey(
        "catalog.GarmentType",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="consumption_rules",
    )
    stock_item = models.ForeignKey(
        StockItem, on_delete=models.CASCADE, related_name="consumption_rules"
    )
    qty_per_unit = models.DecimalField(max_digits=6, decimal_places=2, default=1)

    class Meta:
        db_table = "supplies_consumption_rule"
        constraints = [
            # Scoped to alive rows only: `ConsumptionRuleView.put` soft-deletes
            # the whole table and recreates it on every call (docs/04 §3.8
            # "PUT replaces the set"), so an unconditional constraint would
            # collide with the previous call's now-deleted rows on the very
            # next PUT of the same rule.
            models.UniqueConstraint(
                fields=["service", "garment_type", "stock_item"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_supplies_consumptionrule",
            )
        ]

    def __str__(self) -> str:
        target = self.garment_type.name if self.garment_type_id else self.service.name
        return f"{target} → {self.qty_per_unit}× {self.stock_item.sku}"

"""Custody (docs/02 §3.6, docs/01 §5.3). The garment-line lifecycle is the
second of the three independent state machines (docs/00 §3.3 M-3) — it
tracks physical custody of each item, separate from `Order.status` and
separate from payment. A bag groups the garments handed over together;
each garment inside it is tracked individually so "traceable by scan"
means one scan per item, not per order.
"""

from __future__ import annotations

import secrets

from django.db import models
from django.utils import timezone

from common.models import AppendOnlyModel, HubScopedModel


class GarmentStage(models.TextChoices):
    """docs/01 §5.3 diagram:

        RECEIVED -> SORTED -> PRESSING -> PRESSED -> QC -> PACKED -> DISPATCHED -> DELIVERED
                                  ^                    |
                                  +------- REWORK <-----+  (QC fail)

    Exception branches, reachable from any non-terminal state: DAMAGED,
    LOST, HELD, RETURNED_UNPRESSED.
    """

    RECEIVED = "RECEIVED", "Received"
    SORTED = "SORTED", "Sorted"
    PRESSING = "PRESSING", "Pressing"
    PRESSED = "PRESSED", "Pressed"
    QC = "QC", "Quality check"
    REWORK = "REWORK", "Rework"
    PACKED = "PACKED", "Packed"
    DISPATCHED = "DISPATCHED", "Dispatched"
    DELIVERED = "DELIVERED", "Delivered"
    DAMAGED = "DAMAGED", "Damaged"
    LOST = "LOST", "Lost"
    HELD = "HELD", "Held"
    RETURNED_UNPRESSED = "RETURNED_UNPRESSED", "Returned unpressed"


# Stages a garment can no longer leave through the normal flow — an
# exception branch is a dead end for automated transitions; getting a
# garment out of one is a deliberate ops decision, not a scan.
TERMINAL_STAGES = frozenset({GarmentStage.DELIVERED, GarmentStage.LOST, GarmentStage.DAMAGED})


def _new_bag_code() -> str:
    # Opaque, not sequential (docs/02 §3.6: "not a URL containing customer
    # data" — same principle applies to guessability of the plain code).
    return f"BAG-{secrets.token_hex(5).upper()}"


class Bag(HubScopedModel):
    code = models.CharField(max_length=32, unique=True, editable=False, default=_new_bag_code)
    order = models.ForeignKey("ordering.Order", on_delete=models.CASCADE, related_name="bags")
    garment_count = models.PositiveIntegerField(default=0)
    printed_at = models.DateTimeField(null=True, blank=True)
    current_stage = models.CharField(
        max_length=24, choices=GarmentStage.choices, default=GarmentStage.RECEIVED
    )

    class Meta:
        db_table = "custody_bag"
        indexes = [models.Index(fields=["hub", "current_stage"])]

    def __str__(self) -> str:
        return self.code


class GarmentLine(HubScopedModel):
    order_line = models.ForeignKey(
        "ordering.OrderLine", on_delete=models.CASCADE, related_name="garment_lines"
    )
    bag = models.ForeignKey(Bag, on_delete=models.CASCADE, related_name="garment_lines")
    seq = models.PositiveIntegerField()
    garment_type = models.ForeignKey(
        "catalog.GarmentType", on_delete=models.PROTECT, related_name="+"
    )
    stage = models.CharField(
        max_length=24, choices=GarmentStage.choices, default=GarmentStage.RECEIVED
    )
    condition_notes = models.CharField(max_length=255, blank=True)
    defect_flags = models.JSONField(default=list, blank=True)
    is_rework = models.BooleanField(default=False)
    rework_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "custody_garment_line"
        # docs/02 §6 indexing plan: WIP board counts by stage.
        indexes = [models.Index(fields=["stage", "hub"])]
        constraints = [
            models.UniqueConstraint(fields=["bag", "seq"], name="uniq_custody_garmentline_bag_seq")
        ]

    def __str__(self) -> str:
        return f"{self.bag.code}#{self.seq} {self.garment_type.name} ({self.stage})"


class StageEvent(AppendOnlyModel):
    """The production board (docs/01 §5.3) is a projection of these rows.
    Append-only at the application layer here and at the database role in
    production (docs/02 §5 invariant 9) — a scan history that can be
    edited after the fact is not a scan history."""

    bag = models.ForeignKey(
        Bag, null=True, blank=True, on_delete=models.CASCADE, related_name="stage_events"
    )
    garment_line = models.ForeignKey(
        GarmentLine, null=True, blank=True, on_delete=models.CASCADE, related_name="stage_events"
    )
    hub = models.ForeignKey("territory.Hub", on_delete=models.PROTECT, related_name="+")
    from_stage = models.CharField(max_length=24, blank=True)
    to_stage = models.CharField(max_length=24)
    actor = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    station = models.CharField(max_length=64, blank=True)
    # False when ops used the manual "advance" fallback instead of a real
    # scan (docs/01 §3: "a shop where 40% of transitions are manual is a
    # shop where the inventory numbers are decorative") — surfaced as a
    # data-quality signal, not blocked outright.
    scanned = models.BooleanField(default=True)
    occurred_at = models.DateTimeField(default=timezone.now)
    device_id = models.CharField(max_length=128, blank=True)

    class Meta:
        db_table = "custody_stage_event"
        indexes = [models.Index(fields=["bag", "-occurred_at"])]

    def __str__(self) -> str:
        return f"{self.from_stage or '—'} → {self.to_stage}"


class QcCheck(HubScopedModel):
    class Result(models.TextChoices):
        PASS = "PASS", "Pass"
        FAIL = "FAIL", "Fail"

    garment_line = models.ForeignKey(
        GarmentLine, on_delete=models.CASCADE, related_name="qc_checks"
    )
    result = models.CharField(max_length=8, choices=Result.choices)
    reason = models.CharField(max_length=255, blank=True)
    checked_by = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "custody_qc_check"
        indexes = [models.Index(fields=["garment_line", "-at"])]

    def __str__(self) -> str:
        return f"{self.garment_line} — {self.result}"

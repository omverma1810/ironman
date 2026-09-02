"""Bag creation and QC recording (docs/02 §3.6). Business operations that
call the guarded state machine — never mutate `.stage` directly. Mirrors
ordering/services.py.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from common.errors import ApiError
from custody.models import Bag, GarmentLine, GarmentStage, QcCheck
from custody.state_machine import transition_garment_line


@transaction.atomic
def create_bag_for_order(order, *, order_line_ids: list | None = None, actor=None) -> Bag:
    """One bag, one GarmentLine per verified unit across the order's lines
    (or a subset, for splitting one order across multiple bags). Called
    once intake has fixed the real quantities (docs/02 §3.5) — bags from
    the verified count, never the declared estimate.

    Not idempotent: calling this twice for the same order lines creates a
    second set of garment lines. In practice this is a one-time step right
    after intake, driven from the console; a stronger "already bagged"
    guard is real complexity better added once a real double-bagging
    incident shows it's needed.
    """
    lines_qs = order.lines.all()
    if order_line_ids:
        lines_qs = lines_qs.filter(id__in=order_line_ids)
    lines = list(lines_qs)
    if not lines:
        raise ApiError(f"{order.ref} has no matching order lines to bag.", code="validation_error")

    def _qty(order_line) -> int:
        return (
            order_line.verified_qty
            if order_line.verified_qty is not None
            else order_line.declared_qty
        )

    total_units = sum(_qty(ol) for ol in lines)
    if total_units == 0:
        raise ApiError(f"{order.ref} has no garments to bag.", code="validation_error")

    bag = Bag.objects.create(
        hub=order.hub, order=order, garment_count=total_units, created_by=actor
    )

    seq = 1
    garment_lines = []
    for order_line in lines:
        for _ in range(_qty(order_line)):
            garment_lines.append(
                GarmentLine(
                    hub=order.hub,
                    order_line=order_line,
                    bag=bag,
                    seq=seq,
                    garment_type=order_line.garment_type,
                    created_by=actor,
                )
            )
            seq += 1
    GarmentLine.objects.bulk_create(garment_lines)

    return bag


def mark_printed(bag: Bag) -> Bag:
    bag.printed_at = timezone.now()
    bag.save(update_fields=["printed_at"])
    return bag


@transaction.atomic
def record_qc(
    garment_line: GarmentLine,
    *,
    result: str,
    reason: str = "",
    actor=None,
    scanned: bool = True,
    device_id: str = "",
) -> GarmentLine:
    """docs/01 §5.3: QC branches to PACKED on pass, REWORK on fail — the
    check and the resulting move are recorded together so a QcCheck row
    always has a matching StageEvent, never one without the other."""
    if garment_line.stage != GarmentStage.QC:
        raise ApiError(
            f"{garment_line} must be at QC before a check can be recorded.",
            code="invalid_state_transition",
            status_code=409,
        )
    if result not in QcCheck.Result.values:
        raise ApiError("Unknown QC result.", code="validation_error")

    QcCheck.objects.create(
        hub=garment_line.hub,
        garment_line=garment_line,
        result=result,
        reason=reason,
        checked_by=actor,
    )
    to_stage = GarmentStage.PACKED if result == QcCheck.Result.PASS else GarmentStage.REWORK
    return transition_garment_line(
        garment_line,
        to_stage,
        actor=actor,
        scanned=scanned,
        station="qc",
        device_id=device_id,
    )

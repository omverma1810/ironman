"""Guarded garment-stage transitions (docs/01 §5.3). Mirrors
ordering/state_machine.py: every stage change goes through
`transition_garment_line()` or `transition_bag()` — never a direct
`.stage = X` — which validates the source stage, takes a row lock, and
writes an append-only StageEvent.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from django.db import transaction

from common import audit
from common.errors import InvalidStateTransition
from custody.models import TERMINAL_STAGES, Bag, GarmentLine, GarmentStage, StageEvent

# The allowed graph (docs/01 §5.3 diagram). HELD and the exception branches
# (DAMAGED, LOST, RETURNED_UNPRESSED) are reachable from every non-terminal
# stage — held/damaged/lost garments come back out through HELD, which is
# itself allowed back into any working stage so ops can resume wherever the
# item actually physically is.
_WORKING_STAGES = (
    GarmentStage.RECEIVED,
    GarmentStage.SORTED,
    GarmentStage.PRESSING,
    GarmentStage.PRESSED,
    GarmentStage.QC,
    GarmentStage.PACKED,
    GarmentStage.DISPATCHED,
)
_EXCEPTION_STAGES = {GarmentStage.DAMAGED, GarmentStage.LOST}

ALLOWED: dict[str, set[str]] = {
    GarmentStage.RECEIVED: {GarmentStage.SORTED, GarmentStage.HELD, *_EXCEPTION_STAGES},
    GarmentStage.SORTED: {GarmentStage.PRESSING, GarmentStage.HELD, *_EXCEPTION_STAGES},
    GarmentStage.PRESSING: {
        GarmentStage.PRESSED,
        GarmentStage.RETURNED_UNPRESSED,
        GarmentStage.HELD,
        *_EXCEPTION_STAGES,
    },
    GarmentStage.PRESSED: {GarmentStage.QC, GarmentStage.HELD, *_EXCEPTION_STAGES},
    GarmentStage.QC: {
        GarmentStage.PACKED,
        GarmentStage.REWORK,
        GarmentStage.HELD,
        *_EXCEPTION_STAGES,
    },
    GarmentStage.REWORK: {GarmentStage.PRESSING, GarmentStage.HELD, *_EXCEPTION_STAGES},
    GarmentStage.PACKED: {GarmentStage.DISPATCHED, GarmentStage.HELD, *_EXCEPTION_STAGES},
    GarmentStage.DISPATCHED: {
        GarmentStage.DELIVERED,
        GarmentStage.RETURNED_UNPRESSED,
        GarmentStage.HELD,
        *_EXCEPTION_STAGES,
    },
    GarmentStage.RETURNED_UNPRESSED: {GarmentStage.SORTED, GarmentStage.HELD, *_EXCEPTION_STAGES},
    GarmentStage.HELD: {*_WORKING_STAGES, *_EXCEPTION_STAGES},
    GarmentStage.DELIVERED: set(),
    GarmentStage.DAMAGED: set(),
    GarmentStage.LOST: set(),
}

# Exception and hold transitions always get an AuditEvent in addition to
# the always-written StageEvent (docs/06 §3.3) — these are the garment
# equivalents of an order going CANCELLED or ON_HOLD.
SENSITIVE = {GarmentStage.DAMAGED, GarmentStage.LOST, GarmentStage.HELD}


@transaction.atomic
def transition_garment_line(
    garment_line: GarmentLine,
    to_stage: str,
    *,
    actor=None,
    scanned: bool = True,
    station: str = "",
    device_id: str = "",
) -> GarmentLine:
    garment_line = GarmentLine.objects.select_for_update().get(pk=garment_line.pk)
    from_stage = garment_line.stage

    if from_stage in TERMINAL_STAGES:
        raise InvalidStateTransition(
            f"{garment_line} is already {GarmentStage(from_stage).label} — no further moves."
        )
    if to_stage not in ALLOWED.get(from_stage, set()):
        raise InvalidStateTransition(
            f"{garment_line} can't move from {GarmentStage(from_stage).label} "
            f"to {GarmentStage(to_stage).label} directly.",
            detail=f"Allowed from {from_stage}: {sorted(ALLOWED.get(from_stage, set()))}",
        )

    update_fields = ["stage"]
    if to_stage == GarmentStage.REWORK:
        garment_line.is_rework = True
        garment_line.rework_count += 1
        update_fields += ["is_rework", "rework_count"]

    garment_line.stage = to_stage
    garment_line.save(update_fields=update_fields)

    StageEvent.objects.create(
        bag=garment_line.bag,
        garment_line=garment_line,
        hub=garment_line.hub,
        from_stage=from_stage,
        to_stage=to_stage,
        actor=actor,
        station=station,
        scanned=scanned,
        device_id=device_id,
    )

    # Informational only, kept for the bag list view — GarmentLine.stage
    # (not this field) is the source of truth the production board reads,
    # since lines in one bag can diverge (one sent to REWORK, its bag-mates
    # already PACKED).
    Bag.objects.filter(pk=garment_line.bag_id).update(current_stage=to_stage)

    if to_stage in SENSITIVE:
        audit.record(
            action=f"custody.garment.{to_stage.lower()}",
            object_type="GarmentLine",
            object_id=str(garment_line.id),
            hub=garment_line.hub,
            actor=actor,
            before={"stage": from_stage},
            after={"stage": to_stage},
        )

    return garment_line


@dataclass
class BagTransitionResult:
    bag: Bag
    moved: list[GarmentLine] = field(default_factory=list)
    skipped: list[GarmentLine] = field(default_factory=list)


@transaction.atomic
def transition_bag(
    bag: Bag,
    to_stage: str,
    *,
    actor=None,
    scanned: bool = True,
    station: str = "",
    device_id: str = "",
) -> BagTransitionResult:
    """Advances every garment line in the bag together — the common case,
    since most stages move as a bag (docs/01 §5.3). A line that has already
    diverged (e.g. sent to REWORK while its bag-mates moved on) is skipped
    rather than force-moved, and reported back so ops can see it needs
    separate attention."""
    bag = Bag.objects.select_for_update().get(pk=bag.pk)
    lines = list(GarmentLine.objects.select_for_update().filter(bag=bag))
    if not lines:
        raise InvalidStateTransition(f"Bag {bag.code} has no garment lines to advance.")

    result = BagTransitionResult(bag=bag)
    for line in lines:
        if to_stage in ALLOWED.get(line.stage, set()):
            result.moved.append(
                transition_garment_line(
                    line,
                    to_stage,
                    actor=actor,
                    scanned=scanned,
                    station=station,
                    device_id=device_id,
                )
            )
        else:
            result.skipped.append(line)

    if not result.moved:
        raise InvalidStateTransition(
            f"No garment in bag {bag.code} can move to {GarmentStage(to_stage).label} "
            f"from its current stage."
        )

    bag.refresh_from_db()
    result.bag = bag
    return result

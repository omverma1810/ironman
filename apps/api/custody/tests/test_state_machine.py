"""docs/01 §5.3: the garment-line lifecycle graph, held accountable the
same way ordering/tests/test_state_machine.py holds the order graph
accountable — every valid edge succeeds and writes a StageEvent, every
invalid one is rejected."""

import pytest

from billing.models import OrderCost
from common.errors import InvalidStateTransition
from custody.models import GarmentStage, StageEvent
from custody.state_machine import transition_bag, transition_garment_line
from supplies.models import ConsumptionRule, StockCategory, StockItem, StockLevel, StockUnit
from supplies.services import receive_stock

pytestmark = pytest.mark.django_db


def test_valid_transition_succeeds_and_writes_event(bag, admin_user):
    line = bag.garment_lines.first()
    line = transition_garment_line(line, GarmentStage.SORTED, actor=admin_user, station="sort-1")
    assert line.stage == GarmentStage.SORTED
    event = StageEvent.objects.get(garment_line=line, to_stage=GarmentStage.SORTED)
    assert event.from_stage == GarmentStage.RECEIVED
    assert event.actor_id == admin_user.id
    assert event.station == "sort-1"


def test_invalid_transition_is_rejected(bag):
    line = bag.garment_lines.first()
    with pytest.raises(InvalidStateTransition):
        transition_garment_line(line, GarmentStage.PACKED)  # can't skip the line
    line.refresh_from_db()
    assert line.stage == GarmentStage.RECEIVED


def test_full_happy_path_to_delivered(bag):
    line = bag.garment_lines.first()
    for stage in (
        GarmentStage.SORTED,
        GarmentStage.PRESSING,
        GarmentStage.PRESSED,
        GarmentStage.QC,
        GarmentStage.PACKED,
        GarmentStage.DISPATCHED,
        GarmentStage.DELIVERED,
    ):
        line = transition_garment_line(line, stage)
    assert line.stage == GarmentStage.DELIVERED


def test_terminal_stage_rejects_further_moves(bag):
    line = bag.garment_lines.first()
    for stage in (
        GarmentStage.SORTED,
        GarmentStage.PRESSING,
        GarmentStage.PRESSED,
        GarmentStage.QC,
        GarmentStage.PACKED,
        GarmentStage.DISPATCHED,
        GarmentStage.DELIVERED,
    ):
        line = transition_garment_line(line, stage)
    with pytest.raises(InvalidStateTransition):
        transition_garment_line(line, GarmentStage.HELD)


def test_qc_fail_reaches_rework_then_returns_to_pressing(bag):
    line = bag.garment_lines.first()
    for stage in (
        GarmentStage.SORTED,
        GarmentStage.PRESSING,
        GarmentStage.PRESSED,
        GarmentStage.QC,
    ):
        line = transition_garment_line(line, stage)
    line = transition_garment_line(line, GarmentStage.REWORK)
    assert line.is_rework is True
    line = transition_garment_line(line, GarmentStage.PRESSING)
    assert line.stage == GarmentStage.PRESSING


def test_held_returns_to_the_stage_ops_chooses(bag):
    line = bag.garment_lines.first()
    line = transition_garment_line(line, GarmentStage.SORTED)
    line = transition_garment_line(line, GarmentStage.HELD)
    line = transition_garment_line(line, GarmentStage.SORTED)  # resumed where it was
    assert line.stage == GarmentStage.SORTED


@pytest.mark.parametrize("exception_stage", [GarmentStage.DAMAGED, GarmentStage.LOST])
def test_exception_branches_reachable_from_any_working_stage(bag, exception_stage, admin_user):
    line = bag.garment_lines.first()
    line = transition_garment_line(line, exception_stage, actor=admin_user)
    assert line.stage == exception_stage
    with pytest.raises(InvalidStateTransition):
        transition_garment_line(line, GarmentStage.SORTED)  # terminal


def test_unscanned_manual_transition_is_flagged(bag):
    line = bag.garment_lines.first()
    line = transition_garment_line(line, GarmentStage.SORTED, scanned=False)
    event = StageEvent.objects.get(garment_line=line, to_stage=GarmentStage.SORTED)
    assert event.scanned is False


def test_transition_bag_moves_every_line_together(bag):
    result = transition_bag(bag, GarmentStage.SORTED)
    assert len(result.moved) == bag.garment_lines.count()
    assert len(result.skipped) == 0
    assert all(line.stage == GarmentStage.SORTED for line in bag.garment_lines.all())
    result.bag.refresh_from_db()
    assert result.bag.current_stage == GarmentStage.SORTED


def test_transition_bag_reports_diverged_lines_as_skipped(bag):
    transition_bag(bag, GarmentStage.SORTED)
    transition_bag(bag, GarmentStage.PRESSING)
    transition_bag(bag, GarmentStage.PRESSED)
    transition_bag(bag, GarmentStage.QC)

    diverged = bag.garment_lines.first()
    transition_garment_line(diverged, GarmentStage.REWORK)  # one line falls behind

    # The other two lines can still move to PACKED; the reworked one can't.
    result = transition_bag(bag, GarmentStage.PACKED)
    assert len(result.moved) == bag.garment_lines.count() - 1
    assert result.skipped == [diverged] or [s.id for s in result.skipped] == [diverged.id]


def test_transition_bag_with_no_movable_lines_raises(bag):
    for stage in (
        GarmentStage.SORTED,
        GarmentStage.PRESSING,
        GarmentStage.PRESSED,
        GarmentStage.QC,
        GarmentStage.PACKED,
        GarmentStage.DISPATCHED,
        GarmentStage.DELIVERED,
    ):
        transition_bag(bag, stage)
    # Every line is DELIVERED (terminal) now — nothing can move anywhere.
    with pytest.raises(InvalidStateTransition):
        transition_bag(bag, GarmentStage.SORTED)


# ── Consumable auto-issue on QC-pass to PACKED (docs/08 batch 3.4) ───────


def _advance_to_qc(line):
    for stage in (
        GarmentStage.SORTED,
        GarmentStage.PRESSING,
        GarmentStage.PRESSED,
        GarmentStage.QC,
    ):
        line = transition_garment_line(line, stage)
    return line


def test_packed_issues_consumables_and_records_cost(bag, hub, garment_type):
    line = bag.garment_lines.filter(garment_type=garment_type).first()
    item = StockItem.objects.create(
        hub=hub,
        sku="HANGER-T",
        name="Test hanger",
        category=StockCategory.HANGER,
        unit=StockUnit.PIECE,
    )
    receive_stock(item, qty=10, unit_cost_minor=50)
    ConsumptionRule.objects.create(
        service=garment_type.service, garment_type=garment_type, stock_item=item, qty_per_unit=1
    )

    line = _advance_to_qc(line)
    line = transition_garment_line(line, GarmentStage.PACKED)
    assert line.stage == GarmentStage.PACKED

    assert StockLevel.objects.get(stock_item=item).qty_on_hand == 9

    cost = OrderCost.objects.get(order=bag.order, kind="CONSUMABLE")
    assert cost.amount_minor == 50
    assert cost.source_ref.startswith("stockmovement:")


def test_packed_applies_whole_service_rule_regardless_of_garment_type(
    bag, garment_type_trouser, hub
):
    line = bag.garment_lines.filter(garment_type=garment_type_trouser).first()
    item = StockItem.objects.create(
        hub=hub,
        sku="COVER-T",
        name="Test cover",
        category=StockCategory.COVER,
        unit=StockUnit.PIECE,
    )
    receive_stock(item, qty=10, unit_cost_minor=25)
    ConsumptionRule.objects.create(
        service=garment_type_trouser.service, garment_type=None, stock_item=item, qty_per_unit=1
    )

    line = _advance_to_qc(line)
    transition_garment_line(line, GarmentStage.PACKED)

    assert StockLevel.objects.get(stock_item=item).qty_on_hand == 9
    assert OrderCost.objects.filter(order=bag.order, kind="CONSUMABLE").count() == 1


def test_packed_with_insufficient_stock_skips_rather_than_blocking(bag, garment_type, hub):
    line = bag.garment_lines.filter(garment_type=garment_type).first()
    item = StockItem.objects.create(
        hub=hub,
        sku="HANGER-EMPTY",
        name="Out of stock",
        category=StockCategory.HANGER,
        unit=StockUnit.PIECE,
    )
    # Never received — zero on hand, so `adjust_stock` would raise.
    ConsumptionRule.objects.create(
        service=garment_type.service, garment_type=garment_type, stock_item=item, qty_per_unit=1
    )

    line = _advance_to_qc(line)
    line = transition_garment_line(line, GarmentStage.PACKED)  # must not raise

    assert line.stage == GarmentStage.PACKED
    assert not OrderCost.objects.filter(order=bag.order, kind="CONSUMABLE").exists()


def test_held_resume_to_packed_does_not_reissue_consumables(bag, garment_type, hub):
    line = bag.garment_lines.filter(garment_type=garment_type).first()
    item = StockItem.objects.create(
        hub=hub,
        sku="HANGER-H",
        name="Test hanger",
        category=StockCategory.HANGER,
        unit=StockUnit.PIECE,
    )
    receive_stock(item, qty=10, unit_cost_minor=50)
    ConsumptionRule.objects.create(
        service=garment_type.service, garment_type=garment_type, stock_item=item, qty_per_unit=1
    )

    line = _advance_to_qc(line)
    line = transition_garment_line(line, GarmentStage.PACKED)
    assert OrderCost.objects.filter(order=bag.order, kind="CONSUMABLE").count() == 1

    line = transition_garment_line(line, GarmentStage.HELD)
    transition_garment_line(line, GarmentStage.PACKED)  # resume, not a fresh QC pass

    assert OrderCost.objects.filter(order=bag.order, kind="CONSUMABLE").count() == 1
    assert StockLevel.objects.get(stock_item=item).qty_on_hand == 9

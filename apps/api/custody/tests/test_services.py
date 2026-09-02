"""docs/02 §3.6: bag creation is driven by verified quantities, one
GarmentLine per physical unit."""

import pytest

from common.errors import ApiError
from custody.models import GarmentStage
from custody.services import create_bag_for_order, mark_printed, record_qc

pytestmark = pytest.mark.django_db


def test_create_bag_expands_one_garment_line_per_unit(verified_order):
    bag = create_bag_for_order(verified_order)
    assert bag.garment_count == 3
    assert bag.garment_lines.count() == 3
    assert set(bag.garment_lines.values_list("seq", flat=True)) == {1, 2, 3}
    assert all(line.stage == GarmentStage.RECEIVED for line in bag.garment_lines.all())


def test_create_bag_uses_verified_not_declared_qty(hub, customer, service, garment_type):
    from ordering.models import Order, OrderLine, OrderStatus

    order = Order.objects.create(
        hub=hub, customer=customer, service=service, channel="COUNTER", status=OrderStatus.AT_HUB
    )
    OrderLine.objects.create(
        hub=hub,
        order=order,
        garment_type=garment_type,
        declared_qty=5,
        verified_qty=3,  # variance found at intake
        unit_price_minor=1500,
        line_total_minor=4500,
    )
    bag = create_bag_for_order(order)
    assert bag.garment_count == 3


def test_create_bag_can_split_by_order_line(verified_order):
    shirt_line = verified_order.lines.get(garment_type__code="SHIRT")
    bag = create_bag_for_order(verified_order, order_line_ids=[shirt_line.id])
    assert bag.garment_count == 2
    assert all(line.order_line_id == shirt_line.id for line in bag.garment_lines.all())


def test_create_bag_rejects_order_with_no_lines(hub, customer, service):
    from ordering.models import Order, OrderStatus

    order = Order.objects.create(
        hub=hub, customer=customer, service=service, channel="COUNTER", status=OrderStatus.AT_HUB
    )
    with pytest.raises(ApiError):
        create_bag_for_order(order)


def test_mark_printed_sets_timestamp(bag):
    assert bag.printed_at is None
    bag = mark_printed(bag)
    assert bag.printed_at is not None


def test_qc_pass_moves_to_packed(bag, admin_user):
    line = bag.garment_lines.first()
    for stage in (
        GarmentStage.SORTED,
        GarmentStage.PRESSING,
        GarmentStage.PRESSED,
        GarmentStage.QC,
    ):
        from custody.state_machine import transition_garment_line

        line = transition_garment_line(line, stage, actor=admin_user)

    line = record_qc(line, result="PASS", actor=admin_user)
    assert line.stage == GarmentStage.PACKED
    assert line.qc_checks.count() == 1
    assert line.qc_checks.first().result == "PASS"


def test_qc_fail_moves_to_rework_and_increments_count(bag, admin_user):
    from custody.state_machine import transition_garment_line

    line = bag.garment_lines.first()
    for stage in (
        GarmentStage.SORTED,
        GarmentStage.PRESSING,
        GarmentStage.PRESSED,
        GarmentStage.QC,
    ):
        line = transition_garment_line(line, stage, actor=admin_user)

    line = record_qc(line, result="FAIL", reason="collar crease", actor=admin_user)
    assert line.stage == GarmentStage.REWORK
    assert line.is_rework is True
    assert line.rework_count == 1


def test_qc_requires_garment_at_qc_stage(bag, admin_user):
    line = bag.garment_lines.first()  # still RECEIVED
    with pytest.raises(ApiError):
        record_qc(line, result="PASS", actor=admin_user)

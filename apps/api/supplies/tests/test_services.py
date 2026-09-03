"""docs/02 §3.9: `StockMovement` is the ledger, `StockLevel` a derived
balance that must always equal the sum of movements for that item."""

import pytest

from common.errors import ApiError
from supplies.models import MovementKind, StockLevel, StockMovement
from supplies.services import adjust_stock, receive_stock

pytestmark = pytest.mark.django_db


def test_receive_stock_creates_level_and_movement(stock_item):
    movement = receive_stock(stock_item, qty=100, unit_cost_minor=50, supplier="Acme")
    assert movement.kind == MovementKind.RECEIPT
    assert movement.delta_qty == 100
    level = StockLevel.objects.get(stock_item=stock_item)
    assert level.qty_on_hand == 100
    assert level.avg_unit_cost_minor == 50


def test_receive_stock_blends_weighted_average_cost(stock_item):
    receive_stock(stock_item, qty=100, unit_cost_minor=50)
    receive_stock(stock_item, qty=100, unit_cost_minor=70)
    level = StockLevel.objects.get(stock_item=stock_item)
    assert level.qty_on_hand == 200
    # (100*50 + 100*70) / 200 = 60
    assert level.avg_unit_cost_minor == 60


def test_receive_stock_rejects_non_positive_qty(stock_item):
    with pytest.raises(ApiError):
        receive_stock(stock_item, qty=0, unit_cost_minor=50)


def test_issue_reduces_qty_and_leaves_avg_cost_unchanged(stock_item):
    receive_stock(stock_item, qty=100, unit_cost_minor=50)
    adjust_stock(stock_item, delta=-30, kind="ISSUE", note="packed shirts")
    level = StockLevel.objects.get(stock_item=stock_item)
    assert level.qty_on_hand == 70
    assert level.avg_unit_cost_minor == 50


def test_issue_cannot_take_stock_negative(stock_item):
    receive_stock(stock_item, qty=10, unit_cost_minor=50)
    with pytest.raises(ApiError):
        adjust_stock(stock_item, delta=-20, kind="ISSUE")
    # the failed attempt must not have moved the balance at all
    assert StockLevel.objects.get(stock_item=stock_item).qty_on_hand == 10
    assert StockMovement.objects.filter(stock_item=stock_item, kind=MovementKind.ISSUE).count() == 0


def test_issue_with_positive_delta_is_rejected(stock_item):
    receive_stock(stock_item, qty=10, unit_cost_minor=50)
    with pytest.raises(ApiError):
        adjust_stock(stock_item, delta=5, kind="ISSUE")


def test_return_with_negative_delta_is_rejected(stock_item):
    with pytest.raises(ApiError):
        adjust_stock(stock_item, delta=-5, kind="RETURN")


def test_adjustment_kind_allows_either_sign(stock_item):
    receive_stock(stock_item, qty=10, unit_cost_minor=50)
    adjust_stock(stock_item, delta=-2, kind="ADJUSTMENT", note="damaged in storage")
    assert StockLevel.objects.get(stock_item=stock_item).qty_on_hand == 8
    adjust_stock(stock_item, delta=3, kind="ADJUSTMENT", note="recount")
    assert StockLevel.objects.get(stock_item=stock_item).qty_on_hand == 11


def test_zero_delta_is_rejected(stock_item):
    with pytest.raises(ApiError):
        adjust_stock(stock_item, delta=0, kind="ADJUSTMENT")


def test_receipt_cannot_be_written_via_adjust_stock(stock_item):
    with pytest.raises(ApiError):
        adjust_stock(stock_item, delta=10, kind="RECEIPT")


def test_stock_movement_is_append_only(stock_item):
    movement = receive_stock(stock_item, qty=10, unit_cost_minor=50)
    movement.note = "edited after the fact"
    with pytest.raises(RuntimeError):
        movement.save()

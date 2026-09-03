"""Stock movement (docs/02 §3.9). Every quantity change is a `StockMovement`
row first — `StockLevel` is only ever updated from inside the same
transaction that wrote the movement, under a row lock, so two concurrent
receipts or issues against the same item can never race each other's
read-modify-write of `qty_on_hand` (same discipline as
`territory.services.book_slot`)."""

from __future__ import annotations

from django.db import transaction

from common.errors import ApiError
from supplies.models import ADJUSTMENT_KINDS, MovementKind, StockItem, StockLevel, StockMovement


def get_stock_item(stock_item_id) -> StockItem:
    try:
        return StockItem.objects.get(pk=stock_item_id)
    except StockItem.DoesNotExist as exc:
        raise ApiError("Stock item not found.", code="not_found") from exc


@transaction.atomic
def _apply_movement(
    stock_item: StockItem, *, delta_qty: int, unit_cost_minor: int | None
) -> StockLevel:
    level, _ = StockLevel.objects.select_for_update().get_or_create(
        stock_item=stock_item, defaults={"hub_id": stock_item.hub_id}
    )
    new_qty = level.qty_on_hand + delta_qty
    if new_qty < 0:
        raise ApiError(
            f"Only {level.qty_on_hand} {stock_item.sku} on hand — cannot remove {-delta_qty}.",
            code="validation_error",
        )
    if delta_qty > 0 and unit_cost_minor is not None:
        # Weighted-average cost: the new receipt blends into the running
        # average rather than replacing it (docs/02 §3.9 `avg_unit_cost_minor`).
        prior_value = level.qty_on_hand * level.avg_unit_cost_minor
        incoming_value = delta_qty * unit_cost_minor
        level.avg_unit_cost_minor = (prior_value + incoming_value) // new_qty if new_qty else 0
    level.qty_on_hand = new_qty
    level.save(update_fields=["qty_on_hand", "avg_unit_cost_minor"])
    return level


@transaction.atomic
def receive_stock(
    stock_item: StockItem,
    *,
    qty: int,
    unit_cost_minor: int,
    supplier: str = "",
    invoice_ref: str = "",
    note: str = "",
    actor=None,
) -> StockMovement:
    if qty <= 0:
        raise ApiError("Receipt quantity must be positive.", code="validation_error")
    movement = StockMovement.objects.create(
        stock_item=stock_item,
        hub=stock_item.hub,
        delta_qty=qty,
        kind=MovementKind.RECEIPT,
        unit_cost_minor=unit_cost_minor,
        supplier=supplier,
        invoice_ref=invoice_ref,
        note=note,
        actor=actor,
    )
    _apply_movement(stock_item, delta_qty=qty, unit_cost_minor=unit_cost_minor)
    return movement


@transaction.atomic
def adjust_stock(
    stock_item: StockItem,
    *,
    delta: int,
    kind: str,
    note: str = "",
    order=None,
    actor=None,
) -> StockMovement:
    if kind not in ADJUSTMENT_KINDS:
        raise ApiError(f"'{kind}' is not a valid adjustment kind.", code="validation_error")
    if delta == 0:
        raise ApiError("Adjustment delta cannot be zero.", code="validation_error")
    if kind in (MovementKind.ISSUE, MovementKind.WASTAGE) and delta > 0:
        raise ApiError(
            f"{kind.title()} must reduce stock — delta must be negative.", code="validation_error"
        )
    if kind == MovementKind.RETURN and delta < 0:
        raise ApiError(
            "Return must increase stock — delta must be positive.", code="validation_error"
        )

    movement = StockMovement.objects.create(
        stock_item=stock_item,
        hub=stock_item.hub,
        delta_qty=delta,
        kind=kind,
        order=order,
        note=note,
        actor=actor,
    )
    _apply_movement(stock_item, delta_qty=delta, unit_cost_minor=None)
    return movement

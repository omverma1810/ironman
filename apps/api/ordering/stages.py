"""Customer-facing rollup of `OrderStatus` (docs/02, `packages/tokens`'s
`color.stage`/`stageLabels`) — kept in sync by hand with
`apps/mobile/lib/status.ts`'s `STAGE_BY_STATUS`, the same way that package's
own values are hand-mirrored into `apps/web/app/globals.css`."""

from __future__ import annotations

from ordering.models import OrderStatus

STAGE_BY_STATUS: dict[str, str] = {
    OrderStatus.DRAFT: "booked",
    OrderStatus.PENDING_CONFIRMATION: "booked",
    OrderStatus.SCHEDULED: "booked",
    OrderStatus.PICKUP_ASSIGNED: "pickup",
    OrderStatus.PICKUP_EN_ROUTE: "pickup",
    OrderStatus.PICKUP_FAILED: "failed",
    OrderStatus.PICKED_UP: "atHub",
    OrderStatus.AT_HUB: "atHub",
    OrderStatus.INTAKE_VERIFIED: "atHub",
    OrderStatus.IN_PRODUCTION: "pressing",
    OrderStatus.READY: "ready",
    OrderStatus.DELIVERY_ASSIGNED: "out",
    OrderStatus.OUT_FOR_DELIVERY: "out",
    OrderStatus.DELIVERY_FAILED: "failed",
    OrderStatus.RETURNED_TO_HUB: "atHub",
    OrderStatus.DELIVERED: "delivered",
    OrderStatus.ON_HOLD: "hold",
    OrderStatus.CANCELLED: "failed",
    OrderStatus.CLOSED: "delivered",
}

STAGE_LABELS: dict[str, str] = {
    "booked": "Booked",
    "pickup": "Pickup",
    "atHub": "At Hub",
    "pressing": "Pressing",
    "ready": "Ready",
    "out": "Out for Delivery",
    "delivered": "Delivered",
    "failed": "Failed",
    "hold": "On Hold",
}


def stage_for_status(status: str) -> str:
    return STAGE_BY_STATUS.get(status, "booked")


def stage_label_for_status(status: str) -> str:
    return STAGE_LABELS[stage_for_status(status)]

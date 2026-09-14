import { color, stageLabels } from "@ironman/tokens";
import type { OrderStatus } from "./types";

/** `OrderStatus` has more states than the tokens package's own coarser
 * `color.stage`/`stageLabels` (booked/pickup/atHub/pressing/ready/out/
 * delivered/failed/hold) — same rollup apps/web's own order-status badge
 * uses, so a rider's five picked-up sub-states and a shopper's "your
 * order" screen read as the same handful of stages. */
const STAGE_BY_STATUS: Record<OrderStatus, keyof typeof color.stage> = {
  DRAFT: "booked",
  PENDING_CONFIRMATION: "booked",
  SCHEDULED: "booked",
  PICKUP_ASSIGNED: "pickup",
  PICKUP_EN_ROUTE: "pickup",
  PICKUP_FAILED: "failed",
  PICKED_UP: "atHub",
  AT_HUB: "atHub",
  INTAKE_VERIFIED: "atHub",
  IN_PRODUCTION: "pressing",
  READY: "ready",
  DELIVERY_ASSIGNED: "out",
  OUT_FOR_DELIVERY: "out",
  DELIVERY_FAILED: "failed",
  RETURNED_TO_HUB: "atHub",
  DELIVERED: "delivered",
  ON_HOLD: "hold",
  CANCELLED: "failed",
  CLOSED: "delivered",
};

export function statusColor(status: OrderStatus): string {
  return color.stage[STAGE_BY_STATUS[status]];
}

export function statusLabel(status: OrderStatus): string {
  return stageLabels[STAGE_BY_STATUS[status]];
}

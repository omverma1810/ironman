/** The customer's view of an order's progress (docs/04 "tracking"). */
import type { TrackingEvent } from "./types";

export const STAGE_STEPS = [
  { key: "booked", label: "Booked" },
  { key: "pickup", label: "Pickup" },
  { key: "atHub", label: "At our hub" },
  { key: "pressing", label: "Pressing" },
  { key: "ready", label: "Ready" },
  { key: "out", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
] as const;

/** Index of the stage the order is at, or -1 when it isn't on the happy path
 * (cancelled, on hold, failed). */
export function currentStep(stage: string): number {
  return STAGE_STEPS.findIndex((step) => step.key === stage);
}

const LABELS: Record<string, string> = {
  "order.created": "Order placed",
  "order.scheduled": "Pickup scheduled",
  "order.rescheduled": "Pickup time changed",
  "order.pickup_assigned": "Rider assigned",
  "order.pickup_en_route": "Rider is on the way",
  "order.picked_up": "Clothes collected",
  "order.arrived_at_hub": "Reached our hub",
  "order.pickup_failed": "We couldn't collect your clothes",
  "order.intake_verified": "Counted and checked",
  "order.requote_raised": "Price updated: needs your approval",
  "order.requote_approved": "New price approved",
  "order.requote_rejected": "New price declined",
  "order.delivery_assigned": "Delivery scheduled",
  "order.out_for_delivery": "Out for delivery",
  "order.delivered": "Delivered",
  "order.delivery_failed": "We couldn't deliver",
  "order.returned_to_hub": "Back at our hub",
  "order.cancelled": "Order cancelled",
};

const STATUS_FALLBACK: Record<string, string> = {
  IN_PRODUCTION: "Pressing started",
  READY: "Ready for delivery",
  ON_HOLD: "On hold",
  CLOSED: "Order complete",
};

/** A sentence for an event; falls back to its status, then to nothing worth showing. */
export function eventLabel(event: Pick<TrackingEvent, "event_type" | "to_status">): string | null {
  return LABELS[event.event_type] ?? STATUS_FALLBACK[event.to_status] ?? null;
}

/** Events worth showing, newest first, one line each. Back-to-back repeats
 * (a sequence of identical steps) collapse to the latest. */
export function visibleEvents(events: TrackingEvent[]): { label: string; at: string }[] {
  const shown: { label: string; at: string }[] = [];
  for (const event of [...events].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const label = eventLabel(event);
    if (!label) continue;
    if (shown.length && shown[shown.length - 1].label === label) continue;
    shown.push({ label, at: event.created_at });
  }
  return shown;
}

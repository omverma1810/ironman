/**
 * What a customer may do with an order, by its status. The API's state
 * machine is the real gate; these decide which buttons are worth showing.
 * Before pickup the clothes are still with the customer, so cancelling is a
 * button; after, the clothes are with us and a change is a conversation.
 */
import type { OrderStatus } from "./types";

const BEFORE_PICKUP: OrderStatus[] = ["PENDING_CONFIRMATION", "SCHEDULED", "PICKUP_ASSIGNED", "PICKUP_FAILED"];

export function canCancel(status: OrderStatus): boolean {
  return BEFORE_PICKUP.includes(status);
}

/** Only an order that hasn't had a rider assigned yet can be moved to another window. */
export function canReschedule(status: OrderStatus): boolean {
  return status === "SCHEDULED";
}

export function canReorder(status: OrderStatus): boolean {
  return status !== "DRAFT" && status !== "PENDING_CONFIRMATION";
}

export function canRate(status: OrderStatus): boolean {
  return status === "DELIVERED" || status === "CLOSED";
}

/** Orders that need a human word rather than a progress bar. */
export function isTroubled(status: OrderStatus): boolean {
  return status === "PICKUP_FAILED" || status === "DELIVERY_FAILED" || status === "ON_HOLD" || status === "CANCELLED";
}

export function troubleMessage(status: OrderStatus): string {
  switch (status) {
    case "CANCELLED":
      return "This order was cancelled.";
    case "ON_HOLD":
      return "This order is on hold. We'll reach out if we need anything from you.";
    case "PICKUP_FAILED":
      return "We couldn't collect your clothes. We'll be in touch to find a new time.";
    default:
      return "We hit a snag on this order. We'll be in touch shortly to sort it out.";
  }
}

export const CANCEL_REASONS = [
  "I booked by mistake",
  "I need a different time",
  "I won't be home",
  "Changed my mind",
  "Something else",
] as const;

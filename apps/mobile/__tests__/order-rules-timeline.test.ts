import { canCancel, canRate, canReorder, canReschedule, isTroubled, troubleMessage } from "../lib/order-rules";
import { currentStep, eventLabel, STAGE_STEPS, visibleEvents } from "../lib/timeline";
import { formatDay, formatWindowRange } from "../lib/format";
import type { OrderStatus } from "../lib/types";

describe("what a customer may do with an order", () => {
  it("cancels only while the clothes are still with them", () => {
    const cancellable: OrderStatus[] = ["PENDING_CONFIRMATION", "SCHEDULED", "PICKUP_ASSIGNED", "PICKUP_FAILED"];
    for (const status of cancellable) expect(canCancel(status)).toBe(true);
    for (const status of ["PICKUP_EN_ROUTE", "PICKED_UP", "AT_HUB", "IN_PRODUCTION", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"] as OrderStatus[]) {
      expect(canCancel(status)).toBe(false);
    }
  });

  it("moves the pickup only before a rider is assigned", () => {
    expect(canReschedule("SCHEDULED")).toBe(true);
    expect(canReschedule("PICKUP_ASSIGNED")).toBe(false);
    expect(canReschedule("DELIVERED")).toBe(false);
  });

  it("rates only a delivered order, and re-books any real one", () => {
    expect(canRate("DELIVERED")).toBe(true);
    expect(canRate("CLOSED")).toBe(true);
    expect(canRate("READY")).toBe(false);
    expect(canReorder("DELIVERED")).toBe(true);
    expect(canReorder("CANCELLED")).toBe(true);
    expect(canReorder("DRAFT")).toBe(false);
  });

  it("says plainly when something went wrong", () => {
    expect(isTroubled("CANCELLED")).toBe(true);
    expect(isTroubled("IN_PRODUCTION")).toBe(false);
    expect(troubleMessage("CANCELLED")).toMatch(/cancelled/);
    expect(troubleMessage("ON_HOLD")).toMatch(/on hold/);
  });
});

describe("the timeline", () => {
  it("places an order on the seven-step path, or off it", () => {
    expect(STAGE_STEPS).toHaveLength(7);
    expect(currentStep("booked")).toBe(0);
    expect(currentStep("pressing")).toBe(3);
    expect(currentStep("delivered")).toBe(6);
    expect(currentStep("failed")).toBe(-1);
    expect(currentStep("hold")).toBe(-1);
  });

  it("describes events in the customer's words, with a status fallback", () => {
    expect(eventLabel({ event_type: "order.picked_up", to_status: "PICKED_UP" })).toBe("Clothes collected");
    expect(eventLabel({ event_type: "status.in_production", to_status: "IN_PRODUCTION" })).toBe("Pressing started");
    expect(eventLabel({ event_type: "custody.something_internal", to_status: "" })).toBeNull();
  });

  it("lists events newest first, skipping internal ones and immediate repeats", () => {
    const events = [
      { event_type: "order.created", to_status: "SCHEDULED", stage: "booked", created_at: "2026-10-01T05:00:00Z" },
      { event_type: "custody.something_internal", to_status: "", stage: null, created_at: "2026-10-01T06:00:00Z" },
      { event_type: "order.pickup_assigned", to_status: "PICKUP_ASSIGNED", stage: "pickup", created_at: "2026-10-01T07:00:00Z" },
      { event_type: "order.pickup_assigned", to_status: "PICKUP_ASSIGNED", stage: "pickup", created_at: "2026-10-01T07:30:00Z" },
    ];
    expect(visibleEvents(events).map((e) => e.label)).toEqual(["Rider assigned", "Order placed"]);
  });
});

describe("times are shown in India Standard Time", () => {
  it("whatever the phone's timezone", () => {
    // 03:30 UTC is 9:00 in Hyderabad.
    expect(formatWindowRange("2026-10-07T03:30:00Z", "2026-10-07T05:30:00Z")).toBe("Wed, 7 Oct · 9:00 am – 11:00 am");
    // 20:00 UTC on the 6th is already the 7th in India.
    expect(formatWindowRange("2026-10-06T20:00:00Z", null)).toBe("Wed, 7 Oct · 1:30 am");
    expect(formatWindowRange(null, null)).toBe("To be scheduled");
  });

  it("shows a calendar day as that day", () => {
    expect(formatDay("2026-10-07")).toBe("Wed, 7 Oct");
  });
});

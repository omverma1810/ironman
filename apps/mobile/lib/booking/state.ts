/**
 * The booking flow's state and the rules around it, kept free of React and
 * the network so they can be tested on their own (docs/08 batch 8.1).
 */
import type { PublicApartment, CreateOrderInput, OrderLineInput } from "../types";
import type { ServiceArea } from "../prefs";

export type AddressChoice =
  | { kind: "saved"; id: string; label: string; apartmentId: string | null }
  | {
      kind: "new";
      /** "apartment" = a listed building plus flat; "other" = typed address. */
      mode: "apartment" | "other";
      apartment: PublicApartment | null;
      flatNo: string;
      block: string;
      landmark: string;
      freeText: string;
    };

export type BookingState = {
  area: ServiceArea | null;
  address: AddressChoice | null;
  serviceId: string | null;
  counts: Record<string, number>;
  slotId: string | null;
  notes: string;
  referralCode: string;
  heardFrom: string;
};

export const initialBooking: BookingState = {
  area: null,
  address: null,
  serviceId: null,
  counts: {},
  slotId: null,
  notes: "",
  referralCode: "",
  heardFrom: "",
};

export type BookingAction =
  | { type: "area"; area: ServiceArea }
  | { type: "address"; address: AddressChoice }
  | { type: "service"; serviceId: string }
  | { type: "count"; garment: string; qty: number }
  | { type: "slot"; slotId: string | null }
  | { type: "notes"; notes: string }
  | { type: "referral"; code: string }
  | { type: "heardFrom"; value: string }
  | { type: "reset" };

export const MAX_PER_GARMENT = 50;

export function bookingReducer(state: BookingState, action: BookingAction): BookingState {
  switch (action.type) {
    case "area":
      return { ...state, area: action.area };
    case "address":
      return { ...state, address: action.address };
    case "service":
      // A different service has different garments: counts don't carry over.
      return action.serviceId === state.serviceId
        ? state
        : { ...state, serviceId: action.serviceId, counts: {} };
    case "count": {
      const qty = Math.max(0, Math.min(MAX_PER_GARMENT, Math.trunc(action.qty)));
      const counts = { ...state.counts };
      if (qty === 0) delete counts[action.garment];
      else counts[action.garment] = qty;
      return { ...state, counts };
    }
    case "slot":
      return { ...state, slotId: action.slotId };
    case "notes":
      return { ...state, notes: action.notes.slice(0, 500) };
    case "referral":
      return { ...state, referralCode: action.code.toUpperCase().replace(/\s/g, "").slice(0, 24) };
    case "heardFrom":
      return { ...state, heardFrom: action.value };
    case "reset":
      return { ...initialBooking, area: state.area };
  }
}

export function orderLines(counts: Record<string, number>): OrderLineInput[] {
  return Object.entries(counts)
    .filter(([, qty]) => qty > 0)
    .map(([garment_type, qty]) => ({ garment_type, qty }));
}

export function totalQty(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, qty) => sum + qty, 0);
}

export function addressReady(address: AddressChoice | null): boolean {
  if (!address) return false;
  if (address.kind === "saved") return true;
  if (address.mode === "apartment") return !!address.apartment && address.flatNo.trim().length > 0;
  return address.freeText.trim().length >= 5;
}

/** One line for the confirm screen. */
export function describeAddress(address: AddressChoice | null): string {
  if (!address) return "";
  if (address.kind === "saved") return address.label;
  if (address.mode === "apartment") {
    const unit = [address.flatNo.trim(), address.block.trim() && `Block ${address.block.trim()}`]
      .filter(Boolean)
      .join(", ");
    return [unit, address.apartment?.name].filter(Boolean).join(" · ");
  }
  return [address.freeText.trim(), address.landmark.trim()].filter(Boolean).join(" · ");
}

export function canPlaceOrder(state: BookingState): boolean {
  return (
    !!state.area &&
    !!state.serviceId &&
    addressReady(state.address) &&
    totalQty(state.counts) > 0
  );
}

/**
 * The request body. A saved address is sent by id; a new one by its parts, and
 * the API creates it for the customer on the spot. `apartment` rides along for
 * pricing offers and attribution whichever way the address was chosen.
 */
export function buildOrderInput(state: BookingState): CreateOrderInput {
  if (!canPlaceOrder(state)) throw new Error("The booking isn't complete.");
  const address = state.address!;
  const input: CreateOrderInput = {
    hub: state.area!.hubId,
    service: state.serviceId!,
    channel: "APP",
    lines: orderLines(state.counts),
  };
  if (address.kind === "saved") {
    input.address = address.id;
    if (address.apartmentId) input.apartment = address.apartmentId;
  } else if (address.mode === "apartment") {
    input.apartment = address.apartment!.id;
    input.flat_no = address.flatNo.trim();
    if (address.block.trim()) input.block = address.block.trim();
  } else {
    input.free_text_address = address.freeText.trim();
    if (address.landmark.trim()) input.landmark = address.landmark.trim();
  }
  if (state.slotId) input.pickup_capacity = state.slotId;
  if (state.notes.trim()) input.notes = state.notes.trim();
  if (state.referralCode.trim()) input.referral_code = state.referralCode.trim();
  if (state.heardFrom) input.acquisition_source = state.heardFrom;
  return input;
}

/** "How did you hear about us?" — growth channel codes, in the customer's words. */
export const HEARD_FROM = [
  { value: "WATCHMAN", label: "Our building's security guard" },
  { value: "CUSTOMER_REFERRAL", label: "A friend or neighbour" },
  { value: "FLYER", label: "A flyer or poster" },
  { value: "DIGITAL_AD", label: "An Instagram or Facebook ad" },
  { value: "WHATSAPP", label: "A WhatsApp message" },
  { value: "WALK_IN", label: "I saw your shop or stand" },
  { value: "ORGANIC", label: "I searched online" },
] as const;

import {
  addressReady,
  bookingReducer,
  buildOrderInput,
  canPlaceOrder,
  describeAddress,
  initialBooking,
  MAX_PER_GARMENT,
  orderLines,
  totalQty,
  type AddressChoice,
  type BookingState,
} from "../lib/booking/state";

const area = { pincode: "500027", hubId: "hub-1", hubName: "IronMan — Barkatpura", clusterId: "c-1" };
const apartment = { id: "apt-1", name: "Sai Krupa Residency", cluster: "c-1" };
const newAddress: AddressChoice = {
  kind: "new",
  mode: "apartment",
  apartment,
  flatNo: " 402 ",
  block: "B",
  landmark: "",
  freeText: "",
};

function ready(over: Partial<BookingState> = {}): BookingState {
  return { ...initialBooking, area, address: newAddress, serviceId: "svc-1", counts: { shirt: 2 }, ...over };
}

describe("counts", () => {
  it("clamps to 0..max and drops zeroes", () => {
    let state = bookingReducer(initialBooking, { type: "count", garment: "shirt", qty: 3 });
    expect(state.counts).toEqual({ shirt: 3 });
    state = bookingReducer(state, { type: "count", garment: "shirt", qty: -4 });
    expect(state.counts).toEqual({});
    state = bookingReducer(state, { type: "count", garment: "shirt", qty: 9999 });
    expect(state.counts.shirt).toBe(MAX_PER_GARMENT);
  });

  it("sums and lists only what was chosen", () => {
    expect(totalQty({ a: 2, b: 3 })).toBe(5);
    expect(orderLines({ a: 2, b: 0, c: 1 })).toEqual([
      { garment_type: "a", qty: 2 },
      { garment_type: "c", qty: 1 },
    ]);
  });

  it("forgets the basket when the service changes, but not when it is re-chosen", () => {
    const withService = bookingReducer(ready(), { type: "service", serviceId: "svc-1" });
    expect(withService.counts).toEqual({ shirt: 2 });
    expect(bookingReducer(ready(), { type: "service", serviceId: "svc-2" }).counts).toEqual({});
  });
});

describe("address", () => {
  it("needs a flat in a listed building, or a real address otherwise", () => {
    expect(addressReady(null)).toBe(false);
    expect(addressReady({ ...newAddress, flatNo: "  " } as AddressChoice)).toBe(false);
    expect(addressReady({ ...newAddress, apartment: null } as AddressChoice)).toBe(false);
    expect(addressReady(newAddress)).toBe(true);
    expect(addressReady({ ...newAddress, mode: "other", freeText: "12" } as AddressChoice)).toBe(false);
    expect(addressReady({ ...newAddress, mode: "other", freeText: "12 Main Road" } as AddressChoice)).toBe(true);
    expect(addressReady({ kind: "saved", id: "a-1", label: "x", apartmentId: null })).toBe(true);
  });

  it("describes each kind on one line", () => {
    expect(describeAddress(newAddress)).toBe("402, Block B · Sai Krupa Residency");
    expect(
      describeAddress({ ...newAddress, mode: "other", freeText: "12 Main Road", landmark: "Opp. temple" } as AddressChoice)
    ).toBe("12 Main Road · Opp. temple");
  });
});

describe("the order request", () => {
  it("sends a new listed address by its parts, trimmed, from the app channel", () => {
    expect(buildOrderInput(ready())).toEqual({
      hub: "hub-1",
      service: "svc-1",
      channel: "APP",
      lines: [{ garment_type: "shirt", qty: 2 }],
      apartment: "apt-1",
      flat_no: "402",
      block: "B",
    });
  });

  it("sends a saved address by id and still names its building", () => {
    const state = ready({ address: { kind: "saved", id: "addr-9", label: "x", apartmentId: "apt-7" } });
    expect(buildOrderInput(state)).toMatchObject({ address: "addr-9", apartment: "apt-7" });
    expect(buildOrderInput(state)).not.toHaveProperty("flat_no");
  });

  it("includes the slot, note, referral code and source only when given", () => {
    const plain = buildOrderInput(ready());
    for (const key of ["pickup_capacity", "notes", "referral_code", "acquisition_source"]) {
      expect(plain).not.toHaveProperty(key);
    }
    const full = buildOrderInput(
      ready({ slotId: "slot-1", notes: " ring twice ", referralCode: "RAMESH7", heardFrom: "WATCHMAN" })
    );
    expect(full).toMatchObject({
      pickup_capacity: "slot-1",
      notes: "ring twice",
      referral_code: "RAMESH7",
      acquisition_source: "WATCHMAN",
    });
  });

  it("refuses an incomplete booking", () => {
    expect(canPlaceOrder(ready({ counts: {} }))).toBe(false);
    expect(canPlaceOrder(ready({ area: null }))).toBe(false);
    expect(canPlaceOrder(ready({ serviceId: null }))).toBe(false);
    expect(() => buildOrderInput(ready({ counts: {} }))).toThrow();
  });

  it("tidies a referral code and keeps the area after a reset", () => {
    expect(bookingReducer(initialBooking, { type: "referral", code: " ram esh7 " }).referralCode).toBe("RAMESH7");
    expect(bookingReducer(ready(), { type: "reset" })).toEqual({ ...initialBooking, area });
  });
});

import { formatClock, formatDay, formatMoneyMinor, formatWindow } from "../lib/format";
import { isPlausiblePhone, normalizePhone } from "../lib/phone";

describe("phone numbers", () => {
  it("become +91… however they are typed, so web and app share one account", () => {
    for (const typed of ["9876543210", "98765 43210", "09876543210", "+91 98765 43210", "+919876543210"]) {
      expect(normalizePhone(typed)).toBe("+919876543210");
    }
  });

  it("keeps another country's number as it is", () => {
    expect(normalizePhone("+1 (415) 555-0100")).toBe("+14155550100");
  });

  it("recognises a complete Indian mobile number", () => {
    expect(isPlausiblePhone("98765 43210")).toBe(true);
    expect(isPlausiblePhone("98765")).toBe(false);
    expect(isPlausiblePhone("12345 67890")).toBe(false); // Indian mobiles start 6-9
    expect(isPlausiblePhone("+14155550100")).toBe(true);
  });
});

describe("formatting", () => {
  it("shows rupees with Indian grouping", () => {
    expect(formatMoneyMinor(123456700)).toContain("12,34,567");
  });

  it("reads pickup windows the way people say them", () => {
    expect(formatClock("09:00:00")).toBe("9:00 am");
    expect(formatClock("12:30:00")).toBe("12:30 pm");
    expect(formatClock("00:15:00")).toBe("12:15 am");
    expect(formatWindow("09:00:00", "11:00:00")).toBe("9:00 am – 11:00 am");
  });

  it("doesn't slide a calendar day across timezones", () => {
    expect(formatDay("2026-10-01")).toContain("1 Oct");
    expect(formatDay("2026-12-31")).toContain("31 Dec");
  });
});

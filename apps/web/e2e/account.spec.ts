import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** The customer account area at `/account` (docs/08 batch 4.4) — phone
 * OTP sign-in, profile, saved addresses, order history, invoice download
 * and reorder. Public and JWT-authenticated, never the console's session
 * cookie, so this file never calls `loginAs`. Like `booking.spec.ts`, it
 * reads the E2E-only `/auth/otp/debug` endpoint (config.settings.test
 * only) to complete OTP sign-in without a real phone. */

/** Saving an address requires a `Customer` row, which only exists once a
 * customer has booked at least once (`Customer` is hub-scoped —
 * `identity.OtpVerifyView` alone never creates one, docs/04 §3.1). A
 * genuinely address-less brand-new visitor adds their first address
 * inline inside the booking wizard (`booking.spec.ts`) instead — this
 * test represents a *returning* customer, so it places one order via the
 * API first, exactly as a first booking through `/book` would have. */
async function seedFirstOrder(request: APIRequestContext, accessToken: string) {
  const services = await (await request.get(`${API_BASE_URL}/catalog/services/`)).json();
  const service = services.results[0];
  const garmentTypes = await (
    await request.get(`${API_BASE_URL}/catalog/garment-types/`, { params: { service: service.id } })
  ).json();
  const garmentType = garmentTypes.results[0];
  const serviceability = await (
    await request.get(`${API_BASE_URL}/territory/serviceability`, { params: { pincode: "560095" } })
  ).json();

  const created = await request.post(`${API_BASE_URL}/orders/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      hub: serviceability.hub.id,
      service: service.id,
      channel: "WEB",
      free_text_address: "12 Test Lane",
      lines: [{ garment_type: garmentType.id, qty: 2 }],
    },
  });
  expect(created.ok()).toBeTruthy();
  return (await created.json()) as { ref: string; service_name: string };
}

async function signIn(page: Page, request: APIRequestContext, phoneDigits: string, name: string) {
  const phone = `+91${phoneDigits}`;
  await page.goto("/account");
  await page.getByLabel("Phone number").fill(phoneDigits);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Your name").waitFor();

  const debugRes = await request.get(`${API_BASE_URL}/auth/otp/debug`, { params: { phone } });
  expect(debugRes.ok()).toBeTruthy();
  const { code } = (await debugRes.json()) as { code: string };

  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify & sign in" }).click();
  await page.getByRole("tab", { name: "Orders" }).waitFor();
}

test.describe("Customer account area", () => {
  test("a returning customer can sign in, see order history, and save an address", async ({
    page,
    request,
  }) => {
    const phoneDigits = `9${Date.now().toString().slice(-9)}`;
    await signIn(page, request, phoneDigits, "Priya Nair");

    const accessToken = await page.evaluate(() =>
      localStorage.getItem("ironman.customer.accessToken")
    );
    expect(accessToken).toBeTruthy();
    const order = await seedFirstOrder(request, accessToken as string);

    // Order history reflects the booking made under this same session.
    await page.reload();
    await expect(page.getByText(order.ref)).toBeVisible();
    await expect(page.getByText(order.service_name, { exact: false })).toBeVisible();

    // Profile: the phone verified at sign-in shows read-only; the name
    // supplied at verification is already saved.
    await page.getByRole("tab", { name: "Profile" }).click();
    await expect(page.getByText(`+91${phoneDigits}`)).toBeVisible();
    await expect(page.getByLabel("Name")).toHaveValue("Priya Nair");

    // Addresses: the booking's own `free_text_address` already saved one
    // (get_or_create_address_for_customer) — a second one can be added
    // alongside it.
    await page.getByRole("tab", { name: "Addresses" }).click();
    await expect(page.getByText("12 Test Lane")).toBeVisible();
    await page.getByLabel("Flat no.").fill("14B");
    await page.getByLabel("Full address").fill("Whitefield Main Road");
    await page.getByRole("button", { name: "Save address" }).click();
    await expect(page.getByText(/Flat 14B/)).toBeVisible();
    await expect(page.getByText("12 Test Lane")).toBeVisible();

    // Logging out returns to the sign-in form; the session is gone.
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
  });

  test("a brand-new visitor sees the sign-in form and a clear empty state", async ({
    page,
    request,
  }) => {
    const phoneDigits = `9${Date.now().toString().slice(-9)}`;
    await signIn(page, request, phoneDigits, "Rahul Dev");

    await expect(page.getByText("No orders yet.")).toBeVisible();
    await page.getByRole("tab", { name: "Addresses" }).click();
    await expect(page.getByText("No saved addresses yet.")).toBeVisible();
  });
});

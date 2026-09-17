import type { APIRequestContext } from "@playwright/test";
import { test, expect, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** The customer-side re-quote approval flow (docs/08 batch 4.5) — a
 * variance beyond threshold at intake pauses the order in a `ReQuote`
 * (ADR-008); the customer reviews and approves/rejects it from their
 * account area. `ReQuoteViewSet` used to have zero ownership scoping at
 * all, so this also exercises the fix. Driving an order through
 * pickup/hub intake needs staff, so this file logs in twice: once as
 * `operator` (cookie session, `request` fixture only) to move the order
 * through its lifecycle, and once as the customer (JWT, via the UI) to
 * respond to the re-quote it raises. */

async function csrfHeader(request: APIRequestContext) {
  const cookies = (await request.storageState()).cookies;
  const token = cookies.find((c) => c.name === "csrftoken")?.value;
  if (!token) throw new Error("No csrftoken cookie — did login run first?");
  return { "X-CSRFToken": token };
}

test.describe("Customer-side re-quote approval", () => {
  test("a customer can approve a re-quote raised at intake, and it updates the order total", async ({
    page,
    request,
  }) => {
    const phoneDigits = `9${Date.now().toString().slice(-9)}`;
    const phone = `+91${phoneDigits}`;

    // Sign in as the customer first (JWT) — its access token drives every
    // customer-side call below via `Authorization: Bearer`.
    await page.goto("/account");
    await page.getByLabel("Phone number").fill(phoneDigits);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("Your name").waitFor();
    const debugRes = await request.get(`${API_BASE_URL}/auth/otp/debug`, { params: { phone } });
    expect(debugRes.ok()).toBeTruthy();
    const { code } = (await debugRes.json()) as { code: string };
    await page.getByLabel("Your name").fill("Meera Iyer");
    await page.getByLabel("6-digit code").fill(code);
    await page.getByRole("button", { name: "Verify & sign in" }).click();
    await page.getByRole("tab", { name: "Orders" }).waitFor();
    const accessToken = await page.evaluate(() =>
      localStorage.getItem("ironman.customer.accessToken")
    );
    expect(accessToken).toBeTruthy();

    // The customer books, declaring 5 shirts.
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
        free_text_address: "9 Test Court",
        lines: [{ garment_type: garmentType.id, qty: 5 }],
      },
    });
    expect(created.ok()).toBeTruthy();
    const order = (await created.json()) as { id: string; ref: string; total_minor: number };

    // Ops drives the order to the hub, then records intake with a count
    // far enough off (1 vs 5 declared) to exceed the re-quote threshold.
    const opsLogin = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: DEMO_USERS.operator.email, password: DEMO_USERS.operator.password },
    });
    expect(opsLogin.ok()).toBeTruthy();
    const opsHeaders = await csrfHeader(request);

    for (const to_status of ["PICKUP_ASSIGNED", "PICKUP_EN_ROUTE", "PICKED_UP", "AT_HUB"]) {
      const advanced = await request.post(`${API_BASE_URL}/orders/${order.id}/advance/`, {
        headers: opsHeaders,
        data: { to_status },
      });
      expect(advanced.ok(), `advance to ${to_status}`).toBeTruthy();
    }

    const intake = await request.post(`${API_BASE_URL}/orders/${order.id}/intake/`, {
      headers: opsHeaders,
      data: { verified_lines: [{ garment_type: garmentType.id, qty: 1 }] },
    });
    expect(intake.ok()).toBeTruthy();
    const onHold = await intake.json();
    expect(onHold.status).toBe("ON_HOLD");

    // Back to the customer: the pending re-quote surfaces in their account.
    // `order.ref` also legitimately appears in the order-history list
    // below it, so this checks the re-quote reason text instead — unique
    // to the "Needs your approval" card.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Needs your approval" })).toBeVisible();
    await expect(page.getByText(/Verified count differs/)).toBeVisible();

    await page.getByRole("button", { name: "Approve new total" }).click();
    await expect(page.getByRole("heading", { name: "Needs your approval" })).toHaveCount(0);

    const orderAfter = await (
      await request.get(`${API_BASE_URL}/orders/${order.id}/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    ).json();
    expect(orderAfter.status).toBe("INTAKE_VERIFIED");
    expect(orderAfter.total_minor).toBeLessThan(order.total_minor);
  });
});

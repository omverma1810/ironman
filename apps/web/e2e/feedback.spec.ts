import type { APIRequestContext } from "@playwright/test";
import { test, expect, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** Customer feedback after delivery (docs/08 batch 4.6): a customer rates
 * their own delivered order from `/account`, and the order row then shows
 * "Rated" instead of the rating button. Driving an order all the way to
 * DELIVERED needs staff, so this logs in twice: `operator` (cookie
 * session, `request` fixture only) to move the order through its
 * lifecycle, and the customer (JWT, via the UI) to submit feedback. */

async function csrfHeader(request: APIRequestContext) {
  const cookies = (await request.storageState()).cookies;
  const token = cookies.find((c) => c.name === "csrftoken")?.value;
  if (!token) throw new Error("No csrftoken cookie — did login run first?");
  return { "X-CSRFToken": token };
}

test.describe("Customer feedback after delivery", () => {
  test("a customer can rate a delivered order and the row updates to Rated", async ({
    page,
    request,
  }) => {
    const phoneDigits = `9${Date.now().toString().slice(-9)}`;
    const phone = `+91${phoneDigits}`;

    await page.goto("/account");
    await page.getByLabel("Phone number").fill(phoneDigits);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("Your name").waitFor();
    const debugRes = await request.get(`${API_BASE_URL}/auth/otp/debug`, { params: { phone } });
    expect(debugRes.ok()).toBeTruthy();
    const { code } = (await debugRes.json()) as { code: string };
    await page.getByLabel("Your name").fill("Ravi Shankar");
    await page.getByLabel("6-digit code").fill(code);
    await page.getByRole("button", { name: "Verify & sign in" }).click();
    await page.getByRole("tab", { name: "Orders" }).waitFor();
    const accessToken = await page.evaluate(() =>
      localStorage.getItem("ironman.customer.accessToken")
    );
    expect(accessToken).toBeTruthy();

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
    const order = (await created.json()) as { id: string; ref: string };

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

    // Verified count matches declared, so intake lands straight on
    // INTAKE_VERIFIED — no re-quote to route around here.
    const intake = await request.post(`${API_BASE_URL}/orders/${order.id}/intake/`, {
      headers: opsHeaders,
      data: { verified_lines: [{ garment_type: garmentType.id, qty: 2 }] },
    });
    expect(intake.ok()).toBeTruthy();

    for (const to_status of [
      "IN_PRODUCTION",
      "READY",
      "DELIVERY_ASSIGNED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ]) {
      const advanced = await request.post(`${API_BASE_URL}/orders/${order.id}/advance/`, {
        headers: opsHeaders,
        data: { to_status },
      });
      expect(advanced.ok(), `advance to ${to_status}`).toBeTruthy();
    }

    // A fresh customer with exactly one order — no need to scope past the
    // order ref itself.
    await page.reload();
    await expect(page.getByText(order.ref)).toBeVisible();
    await page.getByRole("button", { name: "Rate order" }).click();

    await expect(page.getByRole("heading", { name: `Rate ${order.ref}` })).toBeVisible();
    await page.getByRole("radio", { name: "5 stars" }).click();
    await page.getByLabel("Comment (optional)").fill("Great turnaround, shirts looked crisp");
    await page.getByRole("button", { name: "Submit rating" }).click();

    await expect(page.getByRole("heading", { name: `Rate ${order.ref}` })).toHaveCount(0);
    await expect(page.getByText("Rated")).toBeVisible();
    await expect(page.getByRole("button", { name: "Rate order" })).toHaveCount(0);

    const orderAfter = await (
      await request.get(`${API_BASE_URL}/orders/${order.id}/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    ).json();
    expect(orderAfter.has_feedback).toBe(true);
  });
});

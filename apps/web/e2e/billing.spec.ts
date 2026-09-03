import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

// seed_demo issues an invoice for every DELIVERED/CLOSED order automatically
// (docs/08 Phase 3 exit criterion), so any order still short of that is
// guaranteed invoice-free — no need to check for an existing one first.
const INVOICEABLE_STATUSES = ["IN_PRODUCTION", "READY", "OUT_FOR_DELIVERY"];

test.describe("Billing", () => {
  test("an operator can issue an invoice from the order detail page", async ({
    page,
    request,
  }) => {
    await loginAs(page, DEMO_USERS.operator);

    const login = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: DEMO_USERS.operator.email, password: DEMO_USERS.operator.password },
    });
    expect(login.ok()).toBeTruthy();

    let orderId: string | undefined;
    for (const status of INVOICEABLE_STATUSES) {
      const res = await request.get(`${API_BASE_URL}/orders/`, { params: { status } });
      const results = (await res.json()).results as { id: string }[];
      if (results.length > 0) {
        orderId = results[0].id;
        break;
      }
    }
    if (!orderId) throw new Error("No seeded order in an invoiceable, not-yet-invoiced state");

    await page.goto(`/console/orders/${orderId}`);
    await expect(page.getByRole("heading", { name: "Invoice" })).toBeVisible();

    await page.getByRole("button", { name: "Issue invoice" }).click();
    await expect(page.getByText(/INV-\d{4}-\d{4} issued/i)).toBeVisible();
  });

  test("issuing an invoice twice for the same order is rejected", async ({ page, request }) => {
    await loginAs(page, DEMO_USERS.operator);

    const login = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: DEMO_USERS.operator.email, password: DEMO_USERS.operator.password },
    });
    expect(login.ok()).toBeTruthy();

    // Pick from the back of each status's result page — the first test
    // picks from the front — so the two tests, which run concurrently,
    // don't race for the same order.
    let orderId: string | undefined;
    for (const status of INVOICEABLE_STATUSES) {
      const res = await request.get(`${API_BASE_URL}/orders/`, { params: { status } });
      const results = (await res.json()).results as { id: string }[];
      if (results.length > 0) {
        orderId = results[results.length - 1].id;
        break;
      }
    }
    if (!orderId) throw new Error("No seeded order in an invoiceable, not-yet-invoiced state");

    await page.goto(`/console/orders/${orderId}`);
    await page.getByRole("button", { name: "Issue invoice" }).click();
    await expect(page.getByText(/INV-\d{4}-\d{4} issued/i)).toBeVisible();

    // An operator can't read invoices back (docs/06 §3.1: "must not see
    // what the business charges"), so the Issue invoice button stays
    // visible even though the order now has one — issuing again must be
    // rejected server-side, not silently hidden client-side.
    await page.getByRole("button", { name: "Issue invoice" }).click();
    await expect(page.getByText(/already has an invoice/i)).toBeVisible();
  });
});

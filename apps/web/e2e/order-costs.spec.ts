import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** docs/08 batch 3.4: `seed_demo` drives several orders all the way to
 * DELIVERED, which (via this batch's own auto-issue/labour-allocation
 * hooks) already leaves them with real `OrderCost` rows — no need to
 * drive a fresh order through custody + fulfilment from scratch here, the
 * same "read the seeded state rather than reconstruct it" choice
 * `orders.spec.ts` and `production.spec.ts` already make for their own
 * seeded pools. */
let deliveredOrderId: string;

test.describe("Order cost model", () => {
  test.beforeAll(async ({ request }) => {
    const login = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: DEMO_USERS.founder.email, password: DEMO_USERS.founder.password },
    });
    expect(login.ok()).toBeTruthy();

    const ordersRes = await request.get(`${API_BASE_URL}/orders/`, {
      params: { status: "DELIVERED", page_size: "50" },
    });
    expect(ordersRes.ok()).toBeTruthy();
    const orders = ((await ordersRes.json()) as { results: { id: string }[] }).results;

    for (const order of orders) {
      const costsRes = await request.get(`${API_BASE_URL}/billing/orders/${order.id}/costs`);
      if (!costsRes.ok()) continue;
      const margin = (await costsRes.json()) as { labour_minor: number; delivery_minor: number };
      if (margin.labour_minor > 0 || margin.delivery_minor > 0) {
        deliveredOrderId = order.id;
        break;
      }
    }
    expect(
      deliveredOrderId,
      "seed data should leave at least one delivered order with labour/delivery cost rows"
    ).toBeTruthy();
  });

  test("an admin sees the unit economics breakdown on a delivered order", async ({ page }) => {
    await loginAs(page, DEMO_USERS.admin);
    await page.goto(`/console/orders/${deliveredOrderId}`);

    // The smallest div containing both the heading (in `CardHeader`) and
    // "Contribution margin" (a sibling `CardContent`) is the `Card` wrapper
    // itself — same "narrow by two filters, take the innermost with
    // `.last()`" idiom `billing.spec.ts`'s own `invoiceRow` uses.
    const section = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: "Unit economics" }) })
      .filter({ hasText: "Contribution margin" })
      .last();
    await expect(section.getByText("Revenue")).toBeVisible();
    await expect(section.getByText(/Fixed costs \(rent, salaries\)/)).toBeVisible();
  });

  test("a founder also sees it, but an operator does not", async ({ page }) => {
    await loginAs(page, DEMO_USERS.founder);
    await page.goto(`/console/orders/${deliveredOrderId}`);
    await expect(page.getByRole("heading", { name: "Unit economics" })).toBeVisible();

    // A section-level RBAC gate, not a page-level one — the rest of the
    // order detail page still renders for an operator.
    await loginAs(page, DEMO_USERS.operator);
    await page.goto(`/console/orders/${deliveredOrderId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Unit economics" })).toBeHidden();
  });
});

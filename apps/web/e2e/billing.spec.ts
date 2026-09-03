import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

// seed_demo issues an invoice for every DELIVERED/CLOSED order automatically
// (docs/08 Phase 3 exit criterion), so any order still short of that is
// guaranteed invoice-free — no need to check for an existing one first.
const INVOICEABLE_STATUSES = ["IN_PRODUCTION", "READY", "OUT_FOR_DELIVERY"];

// playwright.config.ts runs exactly two projects (chromium, mobile) against
// this one seeded backend — keep in sync if that ever changes.
const PROJECT_NAMES = ["chromium", "mobile"];

/** This project's slice of invoiceable orders, fixed once per project run
 * (`beforeAll`, not re-fetched per test): both tests in this file need one
 * order each, and — since `chromium` and `mobile` are separate Playwright
 * projects running this same file against the same seeded backend — a
 * plain "first"/"last" split (as within one project) still lets one
 * project's tests race the other's for the identical order, which one
 * side then finds already invoiced. Split by `sortedIndex %
 * PROJECT_NAMES.length`, same pattern as `field.spec.ts`. */
let orderIds: string[] = [];

test.describe("Billing", () => {
  // Keeps this file's own 2 tests from racing each other within one
  // project, on top of the cross-project split above.
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }, testInfo) => {
    const login = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: DEMO_USERS.operator.email, password: DEMO_USERS.operator.password },
    });
    expect(login.ok()).toBeTruthy();

    const projectIndex = PROJECT_NAMES.indexOf(testInfo.project.name);
    if (projectIndex === -1) {
      throw new Error(
        `Unknown Playwright project "${testInfo.project.name}" — add it to PROJECT_NAMES in billing.spec.ts`
      );
    }

    const eligible: string[] = [];
    for (const status of INVOICEABLE_STATUSES) {
      const res = await request.get(`${API_BASE_URL}/orders/`, { params: { status } });
      const results = (await res.json()).results as { id: string }[];
      eligible.push(...results.map((o) => o.id));
    }
    eligible.sort();
    orderIds = eligible.filter((_, i) => i % PROJECT_NAMES.length === projectIndex);

    if (orderIds.length < 2) {
      throw new Error(
        `Need 2 invoiceable orders for project "${testInfo.project.name}", found ${orderIds.length}`
      );
    }
  });

  test("an operator can issue an invoice from the order detail page", async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);

    await page.goto(`/console/orders/${orderIds[0]}`);
    await expect(page.getByRole("heading", { name: "Invoice" })).toBeVisible();

    await page.getByRole("button", { name: "Issue invoice" }).click();
    // Unlike every other mutation in this suite, issuing renders a PDF
    // server-side (WeasyPrint) inside the same request — genuinely slower
    // than Playwright's default 5s assertion window under CI's real
    // concurrent load, not a sign anything is stuck.
    await expect(page.getByText(/INV-\d{4}-\d{4} issued/i)).toBeVisible({ timeout: 15000 });
  });

  test("issuing an invoice twice for the same order is rejected", async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);

    await page.goto(`/console/orders/${orderIds[1]}`);
    await page.getByRole("button", { name: "Issue invoice" }).click();
    await expect(page.getByText(/INV-\d{4}-\d{4} issued/i)).toBeVisible({ timeout: 15000 });

    // An operator can't read invoices back (docs/06 §3.1: "must not see
    // what the business charges"), so the Issue invoice button stays
    // visible even though the order now has one — issuing again must be
    // rejected server-side, not silently hidden client-side.
    await page.getByRole("button", { name: "Issue invoice" }).click();
    await expect(page.getByText(/already has an invoice/i)).toBeVisible();
  });
});

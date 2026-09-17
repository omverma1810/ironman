import { test, expect, loginAs, loginAsField, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** docs/08 batch 4.2: `seed_demo` drives ~20 orders through `create_order`
 * (and several further through delivery), which — via this batch's own
 * `notify()` wiring — already leaves a real notification log behind, all
 * SKIPPED (no allowlist is configured in CI, the same production-safe
 * default a real staging environment ships with). Reading that seeded
 * state is the same "don't reconstruct what's already there" choice
 * `order-costs.spec.ts` documents for its own seeded pool. */

test.describe("Notification delivery log", () => {
  test("an operator sees real seeded sends, and can search by order ref", async ({
    page,
    request,
    isMobile,
  }) => {
    // `DataTable` renders a real <table> on desktop and switches to
    // `mobileCard` below `md` (its own docstring) — same reasoning
    // `pricing.spec.ts` documents for skipping row-structure assertions
    // on the mobile project.
    test.skip(isMobile, "desktop-only: asserts the <table> row structure directly");
    const login = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: DEMO_USERS.operator.email, password: DEMO_USERS.operator.password },
    });
    expect(login.ok()).toBeTruthy();
    const logRes = await request.get(`${API_BASE_URL}/notifications/log/`, {
      params: { page_size: "1" },
    });
    expect(logRes.ok()).toBeTruthy();
    const [seeded] = ((await logRes.json()) as { results: { order_ref: string }[] }).results;
    expect(seeded, "seed_demo should have produced at least one notification request").toBeTruthy();

    await loginAs(page, DEMO_USERS.operator);
    await page.goto("/console/notifications");

    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page.getByText("SKIPPED").first()).toBeVisible();
    await expect(page.getByText("recipient_not_allowlisted").first()).toBeVisible();

    await page.getByPlaceholder("Search by order ref…").fill(seeded.order_ref);
    await expect(page.getByRole("cell", { name: seeded.order_ref })).toBeVisible();
    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(1);
  });

  test("field staff see the ops-only restricted state, not the real log", async ({ page }) => {
    await loginAsField(page, DEMO_USERS.field);
    await page.goto("/console/notifications");
    await expect(page.getByText(/ops-only/i)).toBeVisible();
    await expect(page.getByPlaceholder("Search by order ref…")).toHaveCount(0);
  });
});

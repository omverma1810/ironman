import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

// docs/08 batch 7.3 — the error-state audit. With every data request
// failing (the API answering 500), each console screen must say so and
// offer a way out. It must never go blank, crash into the global error
// page, or show empty lists and zero totals as if they were real data.
// Sign-in and the current user still work, so this is "the API broke
// mid-shift", not "signed out".

const SCREENS = [
  "/console",
  "/console/orders",
  "/console/production",
  "/console/customers",
  "/console/customers/lapsed",
  "/console/apartments",
  "/console/exceptions",
  "/console/route-days",
  "/console/supplies",
  "/console/invoices",
  "/console/cash-reconciliation",
  "/console/partners",
  "/console/marketing",
  "/console/analytics",
  "/console/pricing",
  "/console/staff",
  "/console/notifications",
  "/console/audit",
];

const SAYS_SO = /try again|retry|couldn.t|could not|something went wrong|unavailable/i;

test("every console screen announces a failed load", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop console");
  test.setTimeout(300_000);
  await loginAs(page, DEMO_USERS.founder);

  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(`${page.url()}: ${err.message}`));
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (/\/api\/v1\/(me|auth\/|platform\/config)/.test(path)) return route.continue();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "server_error",
          message: "Something went wrong on our side.",
          detail: null,
          field_errors: {},
          request_id: "e2e",
          retryable: true,
        },
      }),
    });
  });

  const silent: string[] = [];
  for (const screen of SCREENS) {
    await page.goto(screen);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    // TanStack Query retries before giving up; give it the time it takes.
    const said = await page
      .locator("main")
      .getByText(SAYS_SO)
      .first()
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!said) silent.push(screen);
    await expect(
      page.getByRole("heading", { name: "Something went wrong", level: 1 }),
      `${screen} fell through to the global error page`
    ).toHaveCount(0);
  }
  // Every analytics tab, not just the default one.
  await page.goto("/console/analytics");
  for (const tab of await page.getByRole("tab").allTextContents()) {
    await page.getByRole("tab", { name: tab }).click();
    const said = await page
      .getByRole("tabpanel")
      .getByText(SAYS_SO)
      .first()
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!said) silent.push(`/console/analytics → ${tab}`);
  }

  expect(crashes, "uncaught errors").toEqual([]);
  expect(silent, "screens that hid a failed load").toEqual([]);
});

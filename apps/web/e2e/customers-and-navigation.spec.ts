import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

test.describe("Customers", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);
  });

  test("the customers list renders seeded customers and opens a detail page", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only: asserts the <table> structure directly");
    await page.goto("/console/customers");
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();

    await page.locator("table tbody tr").first().click();
    await page.waitForURL(/\/console\/customers\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Addresses" })).toBeVisible();
  });

  test("searching customers filters the list", async ({ page }) => {
    await page.goto("/console/customers");
    await page.getByPlaceholder(/search by name or phone/i).fill("zzz-nobody-has-this-name");
    await expect(page.getByText(/no customers match/i)).toBeVisible();
  });
});

test.describe("Navigation & error states", () => {
  test("an unknown console route shows the branded 404, not a blank page", async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);
    await page.goto("/console/this-route-does-not-exist");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.getByRole("link", { name: /go to dashboard/i }).click();
    await page.waitForURL("**/console");
  });

  test("phase-2+ nav items render an honest coming-soon state, not a dead link", async ({
    page,
    isMobile,
  }) => {
    await loginAs(page, DEMO_USERS.operator);
    // Below `lg`, the sidebar lives behind the hamburger drawer (docs/05
    // §3). The desktop <aside> copy stays in the DOM (just hidden) even
    // once the drawer opens, so scope the click to the dialog specifically
    // on mobile rather than matching both copies of the link.
    if (isMobile) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.getByRole("dialog").getByRole("link", { name: "Apartments" }).click();
    } else {
      await page.getByRole("link", { name: "Apartments" }).click();
    }
    await expect(page.getByText(/apartment management ui/i)).toBeVisible();
    // The badge's "Phase 2 — Ops console" and the body copy's prose
    // mention of "Phase 2" both match a bare /phase 2/i — anchor on the
    // badge's distinctive em-dash phrasing to disambiguate.
    await expect(page.getByText(/phase 2 —/i)).toBeVisible();
  });

  test("the sidebar hides founder-only items from an operator", async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);
    await expect(page.getByRole("link", { name: "Pricing" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
  });
});

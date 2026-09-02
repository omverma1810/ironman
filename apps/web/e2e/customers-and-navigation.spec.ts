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

  test("phase-3+ stub pages render an honest coming-soon state, not a dead link", async ({
    page,
  }) => {
    await loginAs(page, DEMO_USERS.operator);
    // Pricing's nav link is founder-only (lib/permissions.ts's
    // canEditPricing), but the page itself carries no RBAC guard of its
    // own — go straight there rather than via a link an operator can't see.
    await page.goto("/console/pricing");
    await expect(page.getByText(/price list management/i)).toBeVisible();
    await expect(page.getByText(/phase 3 —/i)).toBeVisible();
  });

  test("the sidebar hides founder-only items from an operator", async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);
    await expect(page.getByRole("link", { name: "Pricing" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
  });
});

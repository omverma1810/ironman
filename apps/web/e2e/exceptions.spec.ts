import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

test.describe("Exceptions", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);
  });

  test("the open queue renders seeded exceptions with SLA and assignment", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only: asserts the <table> structure directly");
    await page.goto("/console/exceptions");
    await expect(page.getByRole("heading", { name: "Exceptions" })).toBeVisible();
    // seed_demo always raises one OPEN+overdue and one INVESTIGATING
    // exception (common/management/commands/seed_demo.py's
    // _seed_exceptions) — checked by content, not row count, since other
    // specs/tests running in parallel (playwright.config.ts's
    // fullyParallel) can add exceptions of their own to the same server.
    const overdueRow = page.locator("table tbody tr", { hasText: "Silk saree" });
    await expect(overdueRow).toBeVisible();
    await expect(overdueRow.getByText("Overdue")).toBeVisible();

    const investigatingRow = page.locator("table tbody tr", { hasText: "one shirt short" });
    await expect(investigatingRow).toBeVisible();
    await expect(investigatingRow.getByText("Rahul Iyer")).toBeVisible();

    await page.getByRole("tab", { name: "All" }).click();
    await expect(page.locator("table tbody tr", { hasText: "different order" })).toBeVisible();
    await expect(page.locator("table tbody tr", { hasText: "hub relocation" })).toBeVisible();
  });

  test("reporting an issue from an order lands it in the queue, and it can be resolved", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only: clicks the <table> row directly");
    await page.goto("/console/orders");
    await page.locator("table tbody tr").first().click();
    await page.waitForURL(/\/console\/orders\/[0-9a-f-]+$/);

    await page.getByRole("button", { name: /report an issue/i }).click();
    await expect(page.getByRole("heading", { name: "Report an issue" })).toBeVisible();
    await page.getByPlaceholder(/be specific/i).fill("Collar was pressed with a visible crease.");
    await page.getByRole("button", { name: /report issue/i }).click();
    await expect(page.getByText(/exception raised/i)).toBeVisible();

    await page.goto("/console/exceptions?status=open");
    await expect(page.getByText("Collar was pressed with a visible crease.")).toBeVisible();

    await page.getByText("Collar was pressed").click();
    await expect(page.getByRole("heading", { name: "Damaged" })).toBeVisible();
    await page.getByRole("button", { name: "Assign to me" }).click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "resolved" }).click();
    await page
      .getByPlaceholder(/what happened, and how/i)
      .fill("Re-pressed on the spot; customer confirmed it looked fine.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/exception updated/i)).toBeVisible();
  });
});

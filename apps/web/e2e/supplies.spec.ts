import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

test.describe("Supplies", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);
  });

  test("the list renders seeded stock items with a reorder alert, and a new item can be created", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only: clicks the <table> row directly");
    await page.goto("/console/supplies");
    await expect(page.getByRole("heading", { name: "Supplies" })).toBeVisible();

    // seed_demo deliberately receives HANGER-001 below its own reorder
    // level (docs/08 batch 2.13's seed docstring) so this banner and the
    // "Low" badge are always exercised without any setup in this test.
    await expect(page.getByText(/at or below reorder level/i)).toBeVisible();
    await expect(page.locator("table tbody tr", { hasText: "HANGER-001" })).toContainText("Low");

    await page.getByRole("button", { name: "New item" }).click();
    await expect(page.getByRole("heading", { name: "New stock item" })).toBeVisible();
    await page.getByLabel("SKU").fill("E2E-SKU-001");
    await page.getByLabel("Name").fill("E2E Test Widget");
    await page.getByRole("button", { name: "Create item" }).click();
    await expect(page.getByText(/E2E Test Widget added/i)).toBeVisible();
    await expect(page.locator("table tbody tr", { hasText: "E2E Test Widget" })).toBeVisible();
  });

  test("stock can be received and then adjusted, and the balance updates live", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only: clicks the <table> row directly");
    await page.goto("/console/supplies");
    await page.waitForSelector("table tbody tr");

    const row = page.locator("table tbody tr", { hasText: "COVER-001" });
    const onHandBefore = Number(
      (await row.locator("td").nth(2).innerText()).match(/\d+/)?.[0] ?? "0"
    );

    await page.getByRole("button", { name: "Receive stock" }).click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: /COVER-001/ }).click();
    await page.getByLabel("Quantity").fill("25");
    await page.getByLabel("Unit cost (₹)").fill("0.30");
    await page.getByRole("button", { name: "Receive" }).click();
    await expect(page.getByText(/Received 25 COVER-001/i)).toBeVisible();
    await expect(row.locator("td").nth(2)).toContainText(String(onHandBefore + 25));

    await page.getByRole("button", { name: "Adjust stock" }).click();
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /COVER-001/ }).click();
    // ISSUE is the default reason — no extra selection needed.
    await page.getByLabel("Quantity").fill("10");
    await page.getByLabel("Note").fill("e2e: packed shirts");
    await page.getByRole("button", { name: "Save adjustment" }).click();
    await expect(page.getByText(/COVER-001 adjusted by -10/i)).toBeVisible();
    await expect(row.locator("td").nth(2)).toContainText(String(onHandBefore + 15));
  });

  test("an issue that would take stock negative is rejected", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop-only: clicks the <table> row directly");
    await page.goto("/console/supplies");
    await page.waitForSelector("table tbody tr");

    await page.getByRole("button", { name: "Adjust stock" }).click();
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /SPOT-001/ }).click();
    await page.getByLabel("Quantity").fill("999999");
    await page.getByRole("button", { name: "Save adjustment" }).click();
    await expect(page.getByText(/only \d+ SPOT-001 on hand/i)).toBeVisible();
  });
});

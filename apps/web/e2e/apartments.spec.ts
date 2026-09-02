import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

test.describe("Apartments master data", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);
  });

  test("the list renders seeded apartments, and a new apartment can be created", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only: clicks the <table> row directly");
    await page.goto("/console/apartments");
    await expect(page.getByRole("heading", { name: "Apartments" })).toBeVisible();
    // seed_demo always creates 6 apartments across 2 clusters.
    await expect(page.getByText("Koramangala 4th Block").first()).toBeVisible();

    await page.getByRole("button", { name: "New apartment" }).click();
    await expect(page.getByRole("heading", { name: "New apartment" })).toBeVisible();
    await page.getByLabel("Name").fill("E2E Test Towers");
    await page.getByLabel("Pincode").fill("560001");
    await page.getByRole("button", { name: "Create apartment" }).click();
    await expect(page.getByText(/E2E Test Towers added/i)).toBeVisible();
    await expect(page.locator("table tbody tr", { hasText: "E2E Test Towers" })).toBeVisible();
  });

  test("editing an apartment adds a contact and toggles its active status", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only: clicks the <table> row directly");
    await page.goto("/console/apartments");
    await page.waitForSelector("table tbody tr");
    const firstRow = page.locator("table tbody tr").first();
    const apartmentName = await firstRow.locator("td").first().innerText();
    await firstRow.click();

    await page.getByPlaceholder("Name", { exact: true }).fill("E2E Watchman");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText(/contact added/i)).toBeVisible();
    await expect(page.getByText("E2E Watchman")).toBeVisible();

    await page.getByRole("button", { name: /click to deactivate/i }).click();
    await expect(page.getByText(new RegExp(`${apartmentName.split("\n")[0]} updated`))).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page
        .locator("table tbody tr", { hasText: apartmentName.split("\n")[0] })
        .getByText("Inactive")
    ).toBeVisible();
  });

  test("clusters can be managed from the apartments page", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop-only: opens a desktop dialog flow");
    await page.goto("/console/apartments");
    await page.getByRole("button", { name: "Manage clusters" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Clusters" })).toBeVisible();
    await expect(dialog.getByText("Koramangala 4th Block")).toBeVisible();

    await dialog.getByPlaceholder("Cluster name…").fill("E2E Cluster");
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText(/cluster "e2e cluster" created/i)).toBeVisible();
    await expect(dialog.getByText("E2E Cluster")).toBeVisible();
  });
});

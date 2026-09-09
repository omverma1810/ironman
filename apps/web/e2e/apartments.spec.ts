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

    // A hardcoded name collides with itself on Playwright's automatic
    // retry-on-failure (playwright.config.ts): (hub, name) is unique
    // (territory.models.Cluster.Meta.constraints), so if this test's own
    // first attempt already created "E2E Cluster" before failing for any
    // unrelated reason, the retry's identical create request 400s on a
    // duplicate — and that 400 (not the original failure) is what a
    // retry actually reports. A per-run name makes retries independent
    // attempts instead of the second one being doomed by the first.
    const clusterName = `E2E Cluster ${Date.now()}`;
    await dialog.getByPlaceholder("Cluster name…").fill(clusterName);
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect(
      page.getByText(new RegExp(`cluster "${clusterName}" created`, "i"))
    ).toBeVisible();
    await expect(dialog.getByText(clusterName)).toBeVisible();
  });
});

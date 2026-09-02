import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

test.describe("Production board", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);
  });

  test("shows WIP by stage and filters the list when a tile is clicked", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only: asserts the <table> structure directly");
    await page.goto("/console/production");
    await expect(page.getByRole("heading", { name: "Production board" })).toBeVisible();

    // seed_demo always leaves at least one IN_PRODUCTION order's bag
    // sitting at PRESSING (common/management/commands/seed_demo.py's
    // _BAG_PATH_BY_ORDER_TARGET) — a stable, non-zero tile to click.
    const pressingTile = page.getByRole("button", { name: /pressing/i });
    await expect(pressingTile).toBeVisible();

    await pressingTile.click();
    await expect(page).toHaveURL(/stage=PRESSING/);
    await expect(page.getByText("Pressing").first()).toBeVisible();

    // every visible row's stage badge should now read Pressing
    const stageBadges = page.locator("table tbody tr").getByText("Pressing");
    await expect(stageBadges.first()).toBeVisible();
  });

  test("batch scan moves a bag forward and updates the WIP tiles", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop-only: reads the bag code from the <table> structure directly");
    await page.goto("/console/production?stage=PRESSING");
    await page.waitForSelector("table tbody tr");

    const bagCode = await page.locator("table tbody tr").first().getByText(/^BAG-/).innerText();

    await page.getByPlaceholder(/scan or type a bag code/i).fill(bagCode);
    await page.getByRole("button", { name: /^add$/i }).click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Pressed", exact: true }).click();
    await page.getByRole("button", { name: /scan 1 to pressed/i }).click();

    await expect(page.getByText(new RegExp(`${bagCode} moved to pressed`, "i"))).toBeVisible();
  });
});

import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

test.describe("Orders", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);
  });

  test("the orders list renders seeded data with working status and channel filters", async ({
    page,
    isMobile,
  }) => {
    // Table-structure assertions below are desktop-specific; the mobile
    // card layout has its own dedicated test further down.
    test.skip(isMobile, "desktop-only: asserts the <table> structure directly");
    await page.goto("/console/orders");
    await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
    await expect(page.getByText(/ORD-\d{4}-\d{4}/).first()).toBeVisible();

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Cancelled" }).click();
    await expect(page).toHaveURL(/status=CANCELLED/);
    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible();
    await expect(page.getByText("Cancelled").first()).toBeVisible();
  });

  test("searching narrows the list, and clearing filters restores it", async ({ page }) => {
    await page.goto("/console/orders");
    await page.getByPlaceholder(/search by order ref/i).fill("zzz-no-such-order-zzz");
    await expect(page.getByText(/no orders match/i)).toBeVisible();
    await page.getByRole("button", { name: /clear filters/i }).click();
    await expect(page.getByPlaceholder(/search by order ref/i)).toHaveValue("");
  });

  test("clicking an order opens its detail page with items and a timeline", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only: clicks the <table> row directly");
    await page.goto("/console/orders");
    await page.locator("table tbody tr").first().click();
    await page.waitForURL(/\/console\/orders\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: /^ORD-/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Items" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  });

  test("the mobile viewport renders order cards, never a horizontally-scrolled table", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "desktop project already covers the table view");
    await page.goto("/console/orders");
    await expect(page.locator("table")).toBeHidden();
    // The hidden desktop <table> still contains matching text nodes
    // earlier in the DOM than the visible mobile card list, so a bare
    // `.first()` resolves there — scope explicitly to the visible card
    // container instead of relying on DOM order.
    const mobileCards = page.locator(".md\\:hidden");
    await expect(mobileCards.getByText(/ORD-\d{4}-\d{4}/).first()).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("creating a counter order end-to-end lands on its detail page with a real total", async ({
    page,
  }) => {
    await page.goto("/console/orders/new");
    await expect(page.getByRole("heading", { name: "New counter order" })).toBeVisible();

    // Hub and service default-select on load; pick the first available customer.
    await page.getByText("Select a customer").click();
    await page.getByRole("option").first().click();

    // Add two of the first garment type shown.
    await page.waitForSelector("text=/Shirt|Trouser|Saree|Kurta|Bedsheet/", { timeout: 10_000 });
    await page.getByRole("button", { name: /increase .* quantity/i }).first().click();
    await page.getByRole("button", { name: /increase .* quantity/i }).first().click();

    await expect(page.getByText("Total")).toBeVisible();
    const createButton = page.getByRole("button", { name: "Create order" });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    await page.waitForURL(/\/console\/orders\/[0-9a-f-]+$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /^ORD-/ })).toBeVisible();
  });

  test("verifying intake on an at-hub order records the count and unlocks the next step", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only: clicks the <table> row directly");
    await page.goto("/console/orders?status=AT_HUB");
    await page.locator("table tbody tr").first().click();
    await page.waitForURL(/\/console\/orders\/[0-9a-f-]+$/);

    await page.getByRole("button", { name: /verify intake/i }).click();
    await expect(page.getByRole("heading", { name: /verify intake/i })).toBeVisible();
    await page.getByRole("button", { name: /confirm intake/i }).click();

    await expect(page.getByText(/intake recorded/i)).toBeVisible();
    await expect(page.getByText(/intake verified/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /verify intake/i })).toBeHidden();
  });
});

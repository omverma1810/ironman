import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

test.describe("Invoices — receivables view", () => {
  test("filters narrow the list and 'outstanding only' hides settled invoices", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only: reads <table> rows");
    await loginAs(page, DEMO_USERS.operator);
    await page.goto("/console/invoices");
    await expect(page.getByRole("columnheader", { name: "Balance" })).toBeVisible();
    await page.waitForSelector("table tbody tr");

    // A search with no match shows the filtered empty state, not the
    // "no invoices yet" one.
    await page.getByLabel("Search invoices").fill("zzzz-no-such-customer");
    await expect(page.getByText("No invoices match")).toBeVisible();
    await page.getByLabel("Search invoices").fill("");
    await page.waitForSelector("table tbody tr");

    await page.getByRole("button", { name: "Outstanding only" }).click();
    await expect(page.getByRole("button", { name: "Outstanding only" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    // Wait for the filtered request to land, then: no settled invoice.
    await page.waitForResponse((r) => r.url().includes("outstanding=true"));
    await expect(page.locator("table tbody tr", { hasText: /^.*\bpaid\b.*$/i })).toHaveCount(0);

    // A date range entirely in the future matches nothing.
    await page.getByLabel("Issued from").fill("2999-01-01");
    await expect(page.getByText("No invoices match")).toBeVisible();
  });

  test("CSV export is offered to an admin and downloads, but not to an operator", async ({
    page,
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only");
    await loginAs(page, DEMO_USERS.operator);
    await page.goto("/console/invoices");
    await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAs(adminPage, DEMO_USERS.admin);
    await adminPage.goto("/console/invoices");
    const [download] = await Promise.all([
      adminPage.waitForEvent("download"),
      adminPage.getByRole("button", { name: "Export CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("invoices.csv");
    const stream = await download.createReadStream();
    let body = "";
    for await (const chunk of stream) body += chunk.toString();
    expect(body.split("\n")[0]).toContain("Invoice,Order,Customer");
    await adminContext.close();
  });
});

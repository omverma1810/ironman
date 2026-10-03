import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

// docs/08 batch 6.2 — the founders' ten weekly numbers, each clickable
// through to the rows it was computed from.

test("founder sees the ten weekly numbers and drills into one", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.founder);
  await page.goto("/console/analytics");

  await expect(page.getByRole("tab", { name: "Weekly numbers", selected: true })).toBeVisible();
  for (const label of [
    "New customers",
    "Repeat customers",
    "Orders per customer",
    "Cost to get a customer",
    "Referrals",
    "Apartments ordering",
    "Average order value",
    "Money made per order",
    "On-time pickup & delivery",
    "Customer feedback",
  ]) {
    await expect(page.getByRole("button", { name: new RegExp(label) })).toBeVisible();
  }

  // The seed delivers its orders this week, so new customers > 0.
  await page.getByRole("button", { name: /New customers/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "New customers" })).toBeVisible();
  await expect(dialog.getByRole("row").nth(1)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Download CSV" })).toHaveAttribute(
    "href",
    /new_customers\/export\.csv/
  );
  await page.keyboard.press("Escape");

  await expect(page.getByRole("link", { name: "Excel" })).toHaveAttribute(
    "href",
    /analytics\/weekly\/export\.xlsx/
  );
  await expect(page.getByRole("link", { name: "PDF" })).toHaveAttribute(
    "href",
    /analytics\/weekly\/export\.pdf/
  );
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.getByText("(this week)")).toHaveCount(0);
});

test("admin sees the numbers but not margins or acquisition cost", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.admin);
  await page.goto("/console/analytics");
  await expect(page.getByRole("button", { name: /New customers/ })).toBeVisible();
  await expect(page.getByText("Founder only")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: "Apartments" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Unit economics" })).toHaveCount(0);
});

test("founder opens each report", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.founder);
  await page.goto("/console/analytics");

  await page.getByRole("tab", { name: "Apartments" }).click();
  await expect(page.getByRole("columnheader", { name: "Money made" })).toBeVisible();

  await page.getByRole("tab", { name: "Channels" }).click();
  await expect(page.getByRole("columnheader", { name: "Cost per customer" })).toBeVisible();

  await page.getByRole("tab", { name: "Unit economics" }).click();
  await expect(page.getByText("Contribution", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Day 30/60/90" }).click();
  await expect(page.getByText("Are customers using the service?")).toBeVisible();

  await page.getByRole("tab", { name: "Operations today" }).click();
  await expect(page.getByText("Work in progress")).toBeVisible();

  await page.getByRole("tab", { name: "Data quality" }).click();
  await expect(page.getByText("Stage moves without a tag scan")).toBeVisible();
});

test("operators get the operations view only", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.operator);
  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByRole("tab", { name: "Operations today", selected: true })).toBeVisible();
  await expect(page.getByText("Work in progress")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Weekly numbers" })).toHaveCount(0);
});

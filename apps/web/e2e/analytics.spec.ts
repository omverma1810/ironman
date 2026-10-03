import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

// docs/08 batch 6.2 — the founders' ten weekly numbers, each clickable
// through to the rows it was computed from.

test("founder sees the ten weekly numbers and drills into one", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.founder);
  await page.goto("/console/analytics");

  await expect(page.getByRole("heading", { name: "Weekly numbers" })).toBeVisible();
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
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.getByText("(this week)")).toHaveCount(0);
});

test("admin sees the numbers but not margins or acquisition cost", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.admin);
  await page.goto("/console/analytics");
  await expect(page.getByRole("button", { name: /New customers/ })).toBeVisible();
  await expect(page.getByText("Founder only")).toHaveCount(2);
});

import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

// docs/08 batch 5.7 (A-06) — the lapsed-customer segment and the
// re-engagement send. Outside production the notification router only
// messages allowlisted phones, so a send here records skips, not texts.

test("admin finds lapsed customers and messages them", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.admin);
  await page.goto("/console/customers");
  await page.getByRole("link", { name: "Lapsed customers" }).click();
  await expect(page).toHaveURL(/\/console\/customers\/lapsed$/);

  // The seed moves a few customers' last delivery back five-plus weeks.
  const rows = page.getByRole("row").filter({ hasText: /days\)/ });
  await expect(rows.first()).toBeVisible();

  await page.getByLabel("Offer line (optional)").fill("Use code FIRST20");
  await page.getByRole("button", { name: /^Message \d+ customers?$/ }).click();
  await expect(page.getByText(/^Sent to \d+ customers?/)).toBeVisible();
});

test("operators can't open the lapsed list", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.operator);
  await page.goto("/console/customers");
  await expect(page.getByRole("link", { name: "Lapsed customers" })).toHaveCount(0);
  await page.goto("/console/customers/lapsed");
  await expect(page.getByText("Admin/Founder-only")).toBeVisible();
});

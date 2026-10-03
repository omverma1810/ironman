import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

// docs/08 batch 5.6 — campaigns, marketing spend and cost per new customer.
// Founder-only (docs/06 §2 "Enter marketing spend").

test("founder creates a campaign, enters spend and sees the cost per customer", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.founder);
  await page.goto("/console/marketing");

  await expect(page.getByText("Cost to get a customer")).toBeVisible();
  // Seeded influencer spend shows in the channel breakdown.
  await expect(page.getByRole("cell", { name: "₹4,000.00" }).first()).toBeVisible();

  const name = `E2E flyers ${Date.now()}`;
  await page.getByRole("button", { name: "New campaign" }).first().click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create campaign" }).click();

  // The campaign row (it has "End"); its spend rows below carry the name too.
  const row = page
    .getByRole("row")
    .filter({ hasText: name })
    .filter({ has: page.getByRole("button", { name: "End" }) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Spend" }).click();
  await page.getByLabel("Amount (₹)").fill("750");
  await page.getByRole("dialog").getByRole("button", { name: "Add spend" }).click();
  await expect(row.getByText("₹750.00")).toBeVisible();

  const spendRow = page
    .getByRole("row")
    .filter({ hasText: name })
    .filter({ has: page.getByRole("button", { name: "Remove" }) });
  await spendRow.getByRole("button", { name: "Remove" }).click();
  await page.getByLabel("Reason for removing").fill("e2e cleanup");
  await page.getByTestId("remove-spend").getByRole("button", { name: "Remove" }).click();
  await expect(row.getByText("₹750.00")).toHaveCount(0);
});

test("admin has no marketing access", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.admin);
  await expect(page.getByRole("link", { name: "Marketing" })).toHaveCount(0);
  await page.goto("/console/marketing");
  await expect(page.getByText("Founder-only")).toBeVisible();
});

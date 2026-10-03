import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

// docs/08 batches 5.3/5.4. The seed gives the demo watchman delivered
// referrals, accrued commission and one settlement awaiting payment.

test("admin sees commission rules and settlements but can't change them", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.admin);
  await page.goto("/console/partners");

  // Rows, not bare text: the data table also renders (hidden) mobile cards.
  const partnerRow = page.getByRole("row").filter({ hasText: "Ramesh (demo watchman)" });
  await expect(partnerRow.getByText(/unpaid/)).toBeVisible();
  await expect(partnerRow.getByText("Ramesh — every order")).toBeVisible();

  await page.getByRole("tab", { name: "Commission rules" }).click();
  const defaultRule = page.getByRole("row").filter({ hasText: "Watchman — first order" });
  await expect(defaultRule.getByText("Hub default")).toBeVisible();
  await expect(page.getByRole("button", { name: "New rule" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Settlements" }).click();
  await expect(page.getByRole("link", { name: "Statement" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark paid" })).toHaveCount(0);
});

test("founder pays a settlement from its statement and creates a rule", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.founder);

  // The statement is a real PDF.
  const list = await page.request.get(`${API_BASE_URL}/growth/settlements/`);
  expect(list.ok()).toBeTruthy();
  const settlements = (await list.json()).results as { id: string; ref: string; status: string }[];
  expect(settlements.length).toBeGreaterThan(0);
  const pdf = await page.request.get(
    `${API_BASE_URL}/growth/settlements/${settlements[0].id}/statement/`
  );
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  await page.goto("/console/partners");
  await page.getByRole("tab", { name: "Settlements" }).click();

  const pending = settlements.find((s) => s.status === "PENDING");
  if (pending) {
    const row = page.getByRole("row").filter({ hasText: pending.ref });
    await row.getByRole("button", { name: "Mark paid" }).click();
    await page.getByLabel("Transaction reference").fill("UPI-E2E-0001");
    await page.getByRole("dialog").getByRole("button", { name: "Mark paid" }).click();
    await expect(row.getByText("Paid", { exact: true })).toBeVisible();
    await expect(row.getByText(/UPI-E2E-0001/)).toBeVisible();
  }

  const name = `E2E rule ${Date.now()}`;
  await page.getByRole("tab", { name: "Commission rules" }).click();
  await page.getByRole("button", { name: "New rule" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Amount (₹)").fill("20");
  await page.getByRole("button", { name: "Create rule" }).click();
  const newRule = page.getByRole("row").filter({ hasText: name });
  await expect(newRule.getByText("₹20.00 per order · first order only")).toBeVisible();
});

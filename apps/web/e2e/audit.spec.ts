import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

// docs/08 batch 7.4 / docs/06 §3.3 — the audit log is viewable, filterable
// and exportable by Admin and Founder, and closed to the operator.

test("founder reads and filters the audit log", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.founder);
  await page.goto("/console/audit");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
    "href",
    /identity\/audit\/export\.csv/
  );
  await expect(page.getByRole("row").nth(1)).toBeVisible();

  await page.getByLabel("Action").fill("no-such-action-anywhere");
  await expect(page.getByText("Nothing matches")).toBeVisible();
});

test("operator gets no access to the audit log", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.operator);
  await page.goto("/console/audit");
  await expect(page.getByText("Admin and Founder only")).toBeVisible();
  await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);
});

import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

// docs/06 §2.2 / §3.1 — an admin invites a rider, the rider sets a
// password from the link and signs in, and deactivating them locks them out.

test("invite a rider, they join, and deactivating locks them out", async ({
  page,
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "desktop console");
  const email = `rider.${Date.now()}@ironman.test`;

  await loginAs(page, DEMO_USERS.admin);
  await page.goto("/console/staff");
  await page.getByRole("button", { name: "Invite staff" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Create invite" }).click();
  const link = await dialog.getByLabel("Invite link").inputValue();
  expect(link).toContain("/console/invite?token=");
  await page.keyboard.press("Escape");
  await expect(page.getByText(email)).toBeVisible(); // waiting to join

  // The rider, in their own browser.
  const rider = await browser.newPage();
  await rider.goto(link);
  await rider.getByLabel("Your name").fill("Ravi Rider");
  await rider.getByLabel("Choose a password").fill("pressed-shirts-42");
  await rider.getByRole("button", { name: "Create my account" }).click();
  await expect(rider.getByText("is ready")).toBeVisible();

  await rider.goto("/field/login");
  await rider.getByLabel("Email", { exact: true }).fill(email);
  await rider.getByLabel("Password", { exact: true }).fill("pressed-shirts-42");
  await rider.getByRole("button", { name: /log in|sign in/i }).click();
  await rider.waitForURL((url) => !url.pathname.endsWith("/login"));

  // The admin switches them off.
  await page.reload();
  const row = page.getByRole("row").filter({ hasText: email });
  await row.getByRole("button", { name: "Deactivate" }).click();
  await page.getByRole("dialog").getByLabel(/Reason/).fill("Left the job");
  await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
  await expect(row.getByText("Deactivated")).toBeVisible();

  // Their open session is gone, and they can't sign back in.
  await rider.goto("/field");
  await rider.waitForURL("**/field/login");
  await rider.getByLabel("Email", { exact: true }).fill(email);
  await rider.getByLabel("Password", { exact: true }).fill("pressed-shirts-42");
  await rider.getByRole("button", { name: /log in|sign in/i }).click();
  await expect(rider).toHaveURL(/\/field\/login/);
  await rider.close();
});

test("an operator cannot manage staff", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop console");
  await loginAs(page, DEMO_USERS.operator);
  await page.goto("/console/staff");
  await expect(page.getByText("Admin and Founder only")).toBeVisible();
});

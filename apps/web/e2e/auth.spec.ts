import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

test.describe("Authentication", () => {
  test("unauthenticated visitors are redirected to login", async ({ page }) => {
    await page.goto("/console");
    await page.waitForURL("**/console/login");
    await expect(page.getByRole("heading", { name: "IronMan Console" })).toBeVisible();
  });

  test("a wrong password shows a human-readable error, not a stack trace", async ({ page }) => {
    await page.goto("/console/login");
    await page.getByLabel("Email", { exact: true }).fill(DEMO_USERS.operator.email);
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();
    // Not getByRole("alert") — Next.js's own route announcer also carries
    // role="alert" and collides with it under strict mode.
    await expect(page.getByText(/incorrect/i)).toBeVisible();
  });

  test("a founder logs in without TOTP (opt-in for the pilot) and reaches the dashboard", async ({
    page,
  }) => {
    await loginAs(page, DEMO_USERS.founder);
    await expect(page).toHaveURL(/\/console$/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("a valid operator login reaches the dashboard", async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);
    await expect(page).toHaveURL(/\/console$/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("logging out returns to the login page and re-guards the console", async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);
    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByText("Log out").click();
    await page.waitForURL("**/console/login");

    // The console stays guarded after logout — going back must not work.
    await page.goto("/console");
    await page.waitForURL("**/console/login");
  });
});

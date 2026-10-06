import { expect, test } from "@playwright/test";
import { RIDER, signInAsRider } from "./fixtures";

test("a rider signs in, sees their day, and signs out", async ({ page }) => {
  await signInAsRider(page);
  await expect(page.getByTestId("day-summary")).toBeVisible();

  await page.getByRole("tab", { name: /Account/ }).click();
  await expect(page.getByTestId("rider-name")).toContainText("Vikram");
  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("sign-in")).toBeVisible();
});

test("office staff are told this app isn't for them", async ({ page }) => {
  await signInAsRider(page, { email: "operator@ironman.test", password: RIDER.password });
  await expect(page.getByText("This app is for field staff.")).toBeVisible();
  await expect(page.getByTestId("day-summary")).toHaveCount(0);
});

test("a wrong password is refused without saying which part was wrong", async ({ page }) => {
  await signInAsRider(page, { email: RIDER.email, password: "not-the-password" });
  await expect(page.getByText("That email or password is incorrect.")).toBeVisible();
});

test("the session survives a restart", async ({ page }) => {
  await signInAsRider(page);
  await expect(page.getByTestId("day-summary")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("day-summary")).toBeVisible();
});

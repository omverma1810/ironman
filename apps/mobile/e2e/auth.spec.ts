import { expect, test } from "@playwright/test";
import { API, newPhone, signIn } from "./fixtures";

test("the login screen won't send a code for half a phone number", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("phone-input").fill("98765");
  await expect(page.getByTestId("login-submit")).toBeDisabled();
  await page.getByTestId("phone-input").fill("98765 43210");
  await expect(page.getByTestId("login-submit")).toBeEnabled();
});

test("signing in with or without +91 is the same account", async ({ page, request, context }) => {
  const phone = newPhone();
  await signIn(page, request, phone);
  await page.getByRole("tab", { name: /Account/ }).click();
  await expect(page.getByText(`+91${phone}`)).toBeVisible();
  await page.getByTestId("log-out").click();
  await expect(page.getByTestId("phone-input")).toBeVisible();

  // Typed the other way, the API sees the same number.
  await page.getByTestId("phone-input").fill(`+91 ${phone.slice(0, 5)} ${phone.slice(5)}`);
  await page.getByTestId("login-submit").click();
  // The new code exists once the code screen is up; before that the debug
  // endpoint still holds the previous sign-in's.
  await expect(page.getByTestId("code-input")).toBeVisible();
  const { code } = await (await request.get(`${API}/auth/otp/debug`, { params: { phone: `+91${phone}` } })).json();
  await page.getByTestId("code-input").fill(code);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("book-pickup")).toBeVisible();
  await context.close();
});

test("an expired access token is renewed without signing the customer out", async ({ page, request }) => {
  await signIn(page, request);
  // Access tokens last 15 minutes; spoil this one the way time would.
  await page.evaluate(() => localStorage.setItem("ironman.accessToken", "expired.token.value"));
  await page.reload();
  await expect(page.getByTestId("book-pickup")).toBeVisible();
  await expect(page.getByText("No orders yet")).toBeVisible();
  // The renewed token replaced the spoiled one.
  const stored = await page.evaluate(() => localStorage.getItem("ironman.accessToken"));
  expect(stored).not.toBe("expired.token.value");
});

test("a revoked session sends the customer back to sign in", async ({ page, request }) => {
  await signIn(page, request);
  await page.evaluate(() => {
    localStorage.setItem("ironman.accessToken", "expired.token.value");
    localStorage.setItem("ironman.refreshToken", "revoked.token.value");
  });
  await page.reload();
  await expect(page.getByTestId("phone-input")).toBeVisible();
});

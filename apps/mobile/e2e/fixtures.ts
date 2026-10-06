import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

let counter = 0;
/** A new Indian mobile number per call, unique across runs and workers, so
 * one test's sign-in code never collides with another's. */
export function newPhone(): string {
  counter += 1;
  const tail = `${Date.now() % 10_000_000}${counter}`.padStart(9, "0").slice(-9);
  return `9${tail}`;
}

/** Signs in through the real screens, reading the code the API would have
 * texted from the test-only debug endpoint. */
export async function signIn(page: Page, request: APIRequestContext, phone = newPhone()) {
  await page.goto("/");
  await page.getByTestId("phone-input").fill(phone);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("code-input")).toBeVisible();
  // The app sends the number normalised to +91…; so does the debug lookup.
  const response = await request.get(`${API}/auth/otp/debug`, { params: { phone: `+91${phone}` } });
  const { code } = await response.json();
  await page.getByTestId("code-input").fill(code);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("book-pickup")).toBeVisible();
  return phone;
}

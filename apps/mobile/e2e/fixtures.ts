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
export async function signIn(
  page: Page,
  request: APIRequestContext,
  phone = newPhone(),
  { name = "Asha Rao" }: { name?: string } = {}
) {
  await page.goto("/");
  await page.getByTestId("phone-input").fill(phone);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("code-input")).toBeVisible();
  // The app sends the number normalised to +91…; so does the debug lookup.
  const response = await request.get(`${API}/auth/otp/debug`, { params: { phone: `+91${phone}` } });
  const { code } = await response.json();
  await page.getByTestId("code-input").fill(code);
  await page.getByTestId("login-submit").click();
  // First sign-in: we ask for a name once; a returning customer goes straight in.
  const asked = page.getByTestId("name-input");
  const home = page.getByTestId("book-pickup");
  await expect(asked.or(home)).toBeVisible();
  if (await asked.isVisible()) {
    await asked.fill(name);
    await page.getByTestId("name-continue").click();
  }
  await expect(home).toBeVisible();
  return phone;
}

/** Books a pickup of two shirts for flat 402 at Sai Krupa Residency, from the
 * orders tab to the order's own screen. Pass `slot` to choose the n-th open
 * pickup window instead of "any time". */
export async function bookTwoShirts(page: Page, { slot }: { slot?: number } = {}) {
  await page.getByTestId("book-pickup").click();
  const pincode = page.getByTestId("pincode-input");
  if (await pincode.isVisible().catch(() => false)) await pincode.fill("500027");
  await expect(page.getByText("IronMan — Barkatpura")).toBeVisible();
  if (await page.getByTestId("apartment-input").isVisible().catch(() => false)) {
    await page.getByTestId("apartment-input").fill("Sai Krupa");
    await page.getByRole("radio", { name: "Sai Krupa Residency" }).click();
    await page.getByTestId("flat-input").fill("402");
  }
  await page.getByTestId("address-continue").click();
  await page.getByRole("button", { name: "More Shirt" }).click();
  await page.getByRole("button", { name: "More Shirt" }).click();
  await expect(page.getByTestId("quote")).toBeVisible();
  await page.getByTestId("items-continue").click();
  if (slot !== undefined) {
    await page.getByRole("radio", { name: /^\d{1,2}:\d{2} [ap]m – / }).nth(slot).click();
  }
  await page.getByTestId("slot-continue").click();
  await page.getByTestId("place-order").click();
  await expect(page.getByText("You're booked")).toBeVisible();
  const ref = ((await page.getByTestId("order-ref").textContent()) ?? "").trim();
  await page.getByTestId("track-order").click();
  await expect(page.getByTestId("order-detail-ref")).toHaveText(ref);
  return ref;
}

/** From anywhere inside the app to the Account tab. */
export async function openAccountTab(page: Page) {
  const tab = page.getByRole("tab", { name: /Account/ });
  // Inside an order or the booking flow the tab bar is covered; go back to it.
  for (let i = 0; i < 4 && !(await tab.isVisible().catch(() => false)); i += 1) await page.goBack();
  await tab.click();
}

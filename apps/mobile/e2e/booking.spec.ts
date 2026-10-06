import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./fixtures";

/** From the orders tab: pincode, a listed building and flat. */
async function enterNewAddress(page: Page) {
  await page.getByTestId("book-pickup").click();
  await page.getByTestId("pincode-input").fill("500027");
  await expect(page.getByText("IronMan — Barkatpura")).toBeVisible();
  await page.getByTestId("apartment-input").fill("Sai Krupa");
  await page.getByRole("radio", { name: "Sai Krupa Residency" }).click();
  await page.getByTestId("flat-input").fill("402");
  await page.getByTestId("address-continue").click();
}

async function chooseItems(page: Page) {
  await page.getByRole("button", { name: "More Shirt" }).click();
  await page.getByRole("button", { name: "More Shirt" }).click();
  await expect(page.getByTestId("quote")).toBeVisible();
  await expect(page.getByText("Shirt × 2")).toBeVisible();
  await page.getByTestId("items-continue").click();
}

test("a new customer books a pickup and finds it in their orders", async ({ page, request }) => {
  await signIn(page, request);
  await expect(page.getByText("No orders yet")).toBeVisible();

  await enterNewAddress(page);
  await chooseItems(page);

  // Pick a real window if one is open; otherwise "any time" is the answer.
  await page.getByTestId("slot-continue").click();

  // A first order asks where they heard of us, and for a referral code.
  await expect(page.getByTestId("referral-input")).toBeVisible();
  await page.getByRole("radio", { name: "Our building's security guard" }).click();
  await page.getByTestId("place-order").click();

  await expect(page.getByText("You're booked")).toBeVisible();
  const ref = (await page.getByTestId("order-ref").textContent())?.trim() ?? "";
  expect(ref).toMatch(/^ORD-/);

  await page.getByTestId("track-order").click();
  await expect(page.getByTestId("order-detail-ref")).toHaveText(ref);
  await expect(page.getByText("Shirt × 2")).toBeVisible();
});

test("a returning customer's area and address are remembered", async ({ page, request }) => {
  await signIn(page, request);
  await enterNewAddress(page);
  await chooseItems(page);
  await page.getByTestId("slot-continue").click();
  await page.getByTestId("place-order").click();
  await expect(page.getByText("You're booked")).toBeVisible();
  await page.getByRole("button", { name: "Back to my orders" }).click();

  await page.getByTestId("book-pickup").click();
  // No pincode to type this time, and last time's address is offered.
  await expect(page.getByText("IronMan — Barkatpura")).toBeVisible();
  await expect(page.getByTestId("pincode-input")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /402.*Sai Krupa Residency/ })).toBeVisible();
  await page.getByRole("radio", { name: /402.*Sai Krupa Residency/ }).click();
  await page.getByTestId("address-continue").click();
  await chooseItems(page);
  await page.getByTestId("slot-continue").click();
  // No longer a first order: no questions about referrals.
  await expect(page.getByTestId("referral-input")).toHaveCount(0);
  await page.getByTestId("place-order").click();
  await expect(page.getByText("You're booked")).toBeVisible();
});

test("an area we don't serve is said plainly, and nothing continues", async ({ page, request }) => {
  await signIn(page, request);
  await page.getByTestId("book-pickup").click();
  await page.getByTestId("pincode-input").fill("110001");
  await expect(page.getByText(/don't pick up from 110001 yet/)).toBeVisible();
  await expect(page.getByTestId("address-continue")).toBeDisabled();
});

test("the continue buttons wait for what they need", async ({ page, request }) => {
  await signIn(page, request);
  await page.getByTestId("book-pickup").click();
  await page.getByTestId("pincode-input").fill("500027");
  await expect(page.getByText("IronMan — Barkatpura")).toBeVisible();
  // A building without a flat number isn't an address.
  await page.getByTestId("apartment-input").fill("Sai Krupa");
  await page.getByRole("radio", { name: "Sai Krupa Residency" }).click();
  await expect(page.getByTestId("address-continue")).toBeDisabled();
  await page.getByTestId("flat-input").fill("12B");
  await expect(page.getByTestId("address-continue")).toBeEnabled();
  await page.getByTestId("address-continue").click();
  // No garments, nothing to price.
  await expect(page.getByTestId("items-continue")).toBeDisabled();
});

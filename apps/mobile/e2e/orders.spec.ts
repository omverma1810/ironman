import { expect, test } from "@playwright/test";
import { bookTwoShirts, signIn } from "./fixtures";

test("a booked order shows its progress, items and what the customer can do", async ({ page, request }) => {
  await signIn(page, request);
  await bookTwoShirts(page);

  await expect(page.getByTestId("order-status")).toHaveText("Booked");
  await expect(page.getByRole("progressbar", { name: /Order progress: Booked/ })).toBeVisible();
  await expect(page.getByText("Shirt × 2 (est.)")).toBeVisible();
  await expect(page.getByText("Order placed")).toBeVisible();
  await expect(page.getByTestId("reorder")).toBeVisible();
  await expect(page.getByTestId("reschedule")).toBeVisible();
  await expect(page.getByTestId("cancel-order")).toBeVisible();
});

test("cancelling asks why, then the order says it was cancelled and offers nothing more to change", async ({
  page,
  request,
}) => {
  await signIn(page, request);
  await bookTwoShirts(page);

  await page.getByTestId("cancel-order").click();
  await page.getByRole("radio", { name: "I need a different time" }).click();
  await page.getByTestId("confirm-cancel").click();

  await expect(page.getByTestId("order-status")).toHaveText("Failed"); // cancelled shares the "failed" stage colour
  await expect(page.getByText("This order was cancelled.")).toBeVisible();
  await expect(page.getByTestId("cancel-order")).toHaveCount(0);
  await expect(page.getByTestId("reschedule")).toHaveCount(0);
  await expect(page.getByText("Order cancelled")).toBeVisible();
});

test("the pickup time can be moved to another open window", async ({ page, request }) => {
  await signIn(page, request);
  await bookTwoShirts(page, { slot: 0 });
  const before = await page.getByTestId("pickup-time").textContent();

  await page.getByTestId("reschedule").click();
  await page.getByRole("radio", { name: /^\d{1,2}:\d{2} [ap]m – / }).nth(2).click();
  await page.getByTestId("save-reschedule").click();

  await expect(page.getByTestId("reschedule")).toBeVisible();
  await expect(page.getByTestId("pickup-time")).not.toHaveText(before ?? "");
  const after = await page.getByTestId("pickup-time").textContent();
  expect(after).not.toBe(before);
});

test("booking again starts from the same basket and the last address", async ({ page, request }) => {
  await signIn(page, request);
  await bookTwoShirts(page);

  await page.getByTestId("reorder").click();
  // The last address is already chosen.
  await expect(page.getByRole("radio", { name: /402.*Sai Krupa Residency/ })).toBeChecked();
  await page.getByTestId("address-continue").click();
  // Two shirts are already in the basket and priced.
  await expect(page.getByLabel("2 Shirt")).toBeVisible();
  await expect(page.getByTestId("quote")).toBeVisible();
  await page.getByTestId("items-continue").click();
  await page.getByTestId("slot-continue").click();
  await page.getByTestId("place-order").click();
  await expect(page.getByText("You're booked")).toBeVisible();
});

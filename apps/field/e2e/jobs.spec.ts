import { expect, test } from "@playwright/test";
import { openJob, seedDelivery, seedPickup, serverStatus, signInAsRider } from "./fixtures";

test("a pickup goes from start to done and the office sees it", async ({ page }) => {
  const { jobId, orderRef } = await seedPickup();
  await signInAsRider(page);
  await openJob(page, orderRef);

  await expect(page.getByTestId("job-address")).toContainText("Sai Krupa");
  await page.getByTestId("start-job").click();
  await page.getByTestId("arrive-job").click();

  // The customer's estimate is two shirts; the rider finds three.
  await expect(page.getByTestId("pickup-total")).toHaveText("2 items");
  await page.getByRole("button", { name: /^More / }).first().click();
  await expect(page.getByTestId("pickup-total")).toHaveText("3 items");
  await page.getByTestId("complete-job").click();

  await expect(page.getByTestId("day-summary")).toBeVisible();
  await expect.poll(() => serverStatus(jobId)).toBe("DONE");
});

test("a delivery needs the order's own bag", async ({ page }) => {
  const { jobId, orderRef, bagCode } = await seedDelivery();
  await signInAsRider(page);
  await openJob(page, orderRef);
  await page.getByTestId("start-job").click();
  await page.getByTestId("arrive-job").click();

  await expect(page.getByTestId("complete-job")).toBeDisabled();
  // A typo is caught at the door, before anything is queued.
  await page.getByTestId("bag-input").fill("BAG-123");
  await page.getByTestId("add-bag").click();
  await expect(page.getByText("Bag codes look like")).toBeVisible();

  await page.getByTestId("bag-input").fill(bagCode.toLowerCase());
  await page.getByTestId("add-bag").click();
  await expect(page.getByTestId("bags-progress")).toHaveText("1 of 1 bag scanned");
  await page.getByTestId("complete-job").click();

  await expect.poll(() => serverStatus(jobId)).toBe("DONE");
});

test("a problem is reported with a reason", async ({ page }) => {
  const { jobId, orderRef } = await seedPickup();
  await signInAsRider(page);
  await openJob(page, orderRef);
  await page.getByTestId("report-problem").click();
  await page.getByTestId("reason-CUSTOMER_ABSENT").click();
  await page.getByTestId("problem-note").fill("Rang twice, no answer");
  await page.getByTestId("confirm-problem").click();

  await expect.poll(() => serverStatus(jobId)).toBe("FAILED");
});

test("a bag from someone else's order is refused, and the rider is told", async ({ page }) => {
  const { jobId, orderRef } = await seedDelivery();
  const other = await seedDelivery(); // a real bag, but for another order
  await signInAsRider(page);
  await openJob(page, orderRef);
  await page.getByTestId("start-job").click();
  await page.getByTestId("arrive-job").click();
  await page.getByTestId("bag-input").fill(other.bagCode);
  await page.getByTestId("add-bag").click();
  await page.getByTestId("complete-job").click();

  // The server refuses; the rider is told on the day list, not left to guess.
  await expect(page.getByTestId("sync-issues")).toContainText(orderRef);
  await expect(page.getByTestId("sync-issues")).toContainText("don't belong to this order");
  expect(await serverStatus(jobId)).not.toBe("DONE");
});

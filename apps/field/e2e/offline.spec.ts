import { expect, test } from "@playwright/test";
import { openJob, seedDelivery, seedPickup, serverStatus, signInAsRider } from "./fixtures";

/** The exit test for the field app, as far as a browser can stand in for a
 * phone: the day is loaded, the signal goes, the whole job is done, and
 * nothing is lost when the signal returns. */

test("a whole pickup done with no signal reaches the office when it returns", async ({
  page,
  context,
}) => {
  const { jobId, orderRef } = await seedPickup();
  await signInAsRider(page);
  await expect(page.getByTestId(`job-${orderRef}`)).toBeVisible();

  await context.setOffline(true);
  await openJob(page, orderRef);
  await page.getByTestId("start-job").click();
  await page.getByTestId("arrive-job").click();
  await page.getByTestId("complete-job").click();

  // The rider sees it done, and is told it hasn't been sent.
  await expect(page.getByTestId("sync-status")).toContainText("saved on this phone");
  await page.getByTestId("toggle-done").click();
  await expect(page.getByTestId(`job-${orderRef}`)).toBeVisible();
  expect(await serverStatus(jobId)).toBe("PENDING");

  await context.setOffline(false);
  await page.getByTestId("send-now").click();
  await expect(page.getByTestId("sync-status")).toHaveCount(0);
  expect(await serverStatus(jobId)).toBe("DONE");
});

test("what was done offline survives the app being closed and reopened", async ({
  page,
  context,
}) => {
  const { jobId, orderRef } = await seedPickup();
  await signInAsRider(page);
  await expect(page.getByTestId(`job-${orderRef}`)).toBeVisible();

  await context.setOffline(true);
  await openJob(page, orderRef);
  await page.getByTestId("start-job").click();
  await expect(page.getByTestId("arrive-job")).toBeVisible();
  expect(await serverStatus(jobId)).toBe("PENDING");

  // Closing and reopening the app with the signal back: the queue was on the
  // phone, so it is sent on start-up with nothing re-done by hand.
  await context.setOffline(false);
  await page.reload();
  await expect.poll(() => serverStatus(jobId)).toBe("EN_ROUTE");
});

test("a delivery completed offline with a wrong bag comes back as an issue, not a silent loss", async ({
  page,
  context,
}) => {
  const { jobId, orderRef } = await seedDelivery();
  const other = await seedDelivery();
  await signInAsRider(page);
  await expect(page.getByTestId(`job-${orderRef}`)).toBeVisible();

  await context.setOffline(true);
  await openJob(page, orderRef);
  await page.getByTestId("start-job").click();
  await page.getByTestId("arrive-job").click();
  await page.getByTestId("bag-input").fill(other.bagCode);
  await page.getByTestId("add-bag").click();
  await page.getByTestId("complete-job").click();

  await context.setOffline(false);
  await page.getByTestId("send-now").click();
  await expect(page.getByTestId("sync-issues")).toContainText("don't belong to this order");
  // The start and arrival still went through; only the completion was refused.
  expect(await serverStatus(jobId)).toBe("ARRIVED");
});

test("the day is still there with no signal at all", async ({ page, context }) => {
  const { orderRef } = await seedPickup();
  await signInAsRider(page);
  await expect(page.getByTestId(`job-${orderRef}`)).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("tab", { name: /Account/ }).click();
  await page.getByRole("tab", { name: /Today/ }).click();
  await expect(page.getByTestId(`job-${orderRef}`)).toBeVisible();
});

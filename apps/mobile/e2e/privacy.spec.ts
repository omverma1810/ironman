import { expect, test } from "@playwright/test";
import { API, bookTwoShirts, newPhone, openAccountTab, signIn } from "./fixtures";

async function openPrivacy(page: import("@playwright/test").Page) {
  await openAccountTab(page);
  await page.getByTestId("open-privacy").click();
  await expect(page.getByText("Download my data").first()).toBeVisible();
}

test("a customer can download everything we hold about them", async ({ page, request }) => {
  const phone = newPhone();
  await signIn(page, request, phone, { name: "Meera Nair" });
  await openPrivacy(page);

  const download = page.waitForEvent("download");
  await page.getByTestId("export-data").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^ironman-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).toString()).toContain(phone);
  await expect(page.getByText("Your data is ready.")).toBeVisible();
});

test("deleting is refused while an order is in progress, and says why", async ({ page, request }) => {
  await signIn(page, request);
  await bookTwoShirts(page);
  await openPrivacy(page);

  await expect(page.getByText("Settle these first:")).toBeVisible();
  await expect(page.getByTestId("start-delete")).toHaveCount(0);
});

test("deleting needs a fresh code, signs out at once, and signing back in restores the account", async ({
  page,
  request,
}) => {
  const phone = newPhone();
  await signIn(page, request, phone, { name: "Meera Nair" });
  await openPrivacy(page);

  await page.getByTestId("start-delete").click();
  await page.getByTestId("send-delete-code").click();
  await expect(page.getByTestId("delete-code")).toBeVisible();

  // Nothing happens with a wrong code.
  await page.getByTestId("delete-code").fill("000000");
  await page.getByTestId("confirm-delete").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("delete-code")).toBeVisible();

  const { code } = await (await request.get(`${API}/auth/otp/debug`, { params: { phone: `+91${phone}` } })).json();
  await page.getByTestId("delete-code").fill(code);
  await page.getByTestId("confirm-delete").click();
  await expect(page.getByText(/Your account is closed/)).toBeVisible();
  await page.getByTestId("deletion-done").click();
  await expect(page.getByTestId("phone-input")).toBeVisible();

  // Signing in again inside the grace period undoes it.
  await page.getByTestId("phone-input").fill(phone);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("code-input")).toBeVisible();
  const again = await (await request.get(`${API}/auth/otp/debug`, { params: { phone: `+91${phone}` } })).json();
  await page.getByTestId("code-input").fill(again.code);
  await page.getByTestId("login-submit").click();
  await expect(page.getByText(/Your account is restored/)).toBeVisible();
  await expect(page.getByTestId("book-pickup")).toBeVisible();
});

import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

// docs/08 batch 7.5 — a customer downloads their data, deletes their
// account, and changes their mind by signing in again (docs/06 §5–6).

async function latestCode(request: APIRequestContext, phoneDigits: string) {
  const debug = await request.get(`${API_BASE_URL}/auth/otp/debug`, {
    params: { phone: `+91${phoneDigits}` },
  });
  return ((await debug.json()) as { code: string }).code;
}

async function signIn(page: Page, request: APIRequestContext, phoneDigits: string) {
  await page.goto("/account");
  await page.getByLabel("Phone number").fill(phoneDigits);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Your name").waitFor();
  await page.getByLabel("Your name").fill("Meera Private");
  await page.getByLabel("6-digit code").fill(await latestCode(request, phoneDigits));
  await page.getByRole("button", { name: "Verify & sign in" }).click();
  await page.getByRole("tab", { name: "Orders" }).waitFor();
}

test("a customer downloads their data, deletes the account, then comes back", async ({
  page,
  request,
}) => {
  const digits = `96${String(Date.now()).slice(-8)}`;
  await signIn(page, request, digits);
  await page.getByRole("tab", { name: "Privacy" }).click();

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my data" }).click();
  expect((await downloading).suggestedFilename()).toMatch(/^ironman-my-data-.*\.json$/);

  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Send code" }).click();
  await dialog.getByLabel(/6-digit code sent to/).waitFor();
  await dialog.getByLabel(/6-digit code sent to/).fill(await latestCode(request, digits));
  await dialog.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("Your account is closed")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Sign in to your account")).toBeVisible();

  // Signing in during the grace period cancels the deletion.
  await signIn(page, request, digits);
  await expect(page.getByText("Welcome back. Your account will not be deleted.")).toBeVisible();
});

test("deletion waits until an order in progress is finished", async ({ page, request }) => {
  const digits = `95${String(Date.now()).slice(-8)}`;
  await signIn(page, request, digits);

  const token = await page.evaluate(() => localStorage.getItem("ironman.customer.accessToken"));
  const services = await (await request.get(`${API_BASE_URL}/catalog/services/`)).json();
  const service = services.results[0];
  const types = await (
    await request.get(`${API_BASE_URL}/catalog/garment-types/`, { params: { service: service.id } })
  ).json();
  const area = await (
    await request.get(`${API_BASE_URL}/territory/serviceability`, { params: { pincode: "500027" } })
  ).json();
  const booked = await request.post(`${API_BASE_URL}/orders/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      hub: area.hub.id,
      service: service.id,
      channel: "WEB",
      free_text_address: "7 Privacy Lane",
      lines: [{ garment_type: types.results[0].id, qty: 2 }],
    },
  });
  expect(booked.ok()).toBeTruthy();
  const order = await booked.json();

  await page.getByRole("tab", { name: "Privacy" }).click();
  const blockers = page.getByTestId("deletion-blockers");
  await expect(blockers).toContainText("still in progress");
  await expect(blockers).toContainText(order.ref);
  await expect(page.getByRole("button", { name: "Delete my account" })).toHaveCount(0);
});

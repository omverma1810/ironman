import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

// docs/08 batch 5.5 — customer referral codes, sharing and reward credit.
// Sign-in uses the E2E-only OTP debug endpoint, as in account.spec.ts.

async function signIn(page: Page, request: APIRequestContext, phoneDigits: string) {
  await page.goto("/account");
  await page.getByLabel("Phone number").fill(phoneDigits);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Your name").waitFor();
  const debug = await request.get(`${API_BASE_URL}/auth/otp/debug`, {
    params: { phone: `+91${phoneDigits}` },
  });
  const { code } = (await debug.json()) as { code: string };
  await page.getByLabel("Your name").fill("Asha Referrer");
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify & sign in" }).click();
  await page.getByRole("tab", { name: "Orders" }).waitFor();
}

test("a customer shares their code from their account", async ({ page, request }) => {
  const digits = `97${String(Date.now()).slice(-8)}`;
  await signIn(page, request, digits);

  // No booking yet → no code yet, explained rather than an error.
  await page.getByRole("tab", { name: "Refer & earn" }).click();
  await expect(page.getByText("Your referral code appears after your first booking.")).toBeVisible();

  // Book once (as /book would), then the code is there to share.
  const token = await page.evaluate(() => localStorage.getItem("ironman.customer.accessToken"));
  expect(token).toBeTruthy();
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
      free_text_address: "3 Referral Road",
      lines: [{ garment_type: types.results[0].id, qty: 2 }],
    },
  });
  expect(booked.ok()).toBeTruthy();

  await page.reload();
  await page.getByRole("tab", { name: "Refer & earn" }).click();
  const code = page.locator(".font-mono.text-2xl");
  await expect(code).toHaveText(/^ASHAREFE\d{3}$/);
  const share = page.getByRole("link", { name: "Share on WhatsApp" });
  await expect(share).toHaveAttribute("href", /wa\.me/);
  await expect(share).toHaveAttribute("href", new RegExp(await code.innerText()));
  await expect(page.getByText("₹50.00", { exact: false }).first()).toBeVisible();
});

test("admin sees refer-a-friend terms and the seeded reward", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.admin);
  await page.goto("/console/partners");
  await page.getByRole("tab", { name: "Customer referrals" }).click();
  await expect(page.getByLabel("Customer who refers gets (₹)")).toHaveValue("50");
  await expect(page.getByLabel("Customer who refers gets (₹)")).toBeDisabled();
  await expect(page.getByRole("row").filter({ hasText: "Kavya Reddy" })).toBeVisible();
});

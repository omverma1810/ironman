import { test, expect, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** The booking wizard at `/book` (docs/08 batch 4.3) is the site's first
 * genuinely public, unauthenticated-until-the-last-step flow — this file
 * never calls `loginAs`. It relies on `seed_demo`'s real Barkatpura/Kacheguda
 * apartments/pincodes/capacity (same "don't reconstruct what's already
 * there" reasoning `tracking.spec.ts`/`order-costs.spec.ts` document for
 * their own seeded pools) plus the E2E-only `/auth/otp/debug` endpoint
 * (`config.settings.test` only — see identity/notify.py) to read the OTP
 * code a real phone can't receive in CI. */

/** Drives the wizard from the pincode step through phone verification,
 * stopping on the "Review & confirm" step. `url` lets a test arrive via a
 * shared link (`/book?ref=CODE`). */
async function bookUpToConfirm(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
  { url = "/book", name = "Asha Rao" }: { url?: string; name?: string } = {}
) {
    // Unique per run so parallel projects (chromium/mobile) never share an
    // `/auth/otp/debug` cache key.
    const phoneDigits = `9${Date.now().toString().slice(-9)}`;
    const phone = `+91${phoneDigits}`;

    await page.goto(url);

    // Step 1: pincode / serviceability.
    await page.getByLabel("Pincode").fill("500027");
    await expect(page.getByText(/we service this area from/i)).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

    // Step 2: address — search a real seeded apartment.
    await page.getByPlaceholder("Search your apartment by name…").fill("Sai Krupa");
    await page.getByRole("button", { name: "Sai Krupa Residency" }).click();
    await page.getByLabel("Flat no.").fill("402");
    await page.getByRole("button", { name: "Next" }).click();

    // Step 3: service.
    await page.getByRole("button", { name: "Ironing" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    // Step 4: garment counts + live quote.
    await page.getByRole("button", { name: "More Shirt" }).click();
    await page.getByRole("button", { name: "More Shirt" }).click();
    await expect(page.getByText("Total", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

    // Step 5: pickup slot (any open one) + notes.
    await page
      .getByRole("button", { name: /am|pm/i })
      .first()
      .click();
    await page.getByLabel(/anything we should know/i).fill("Ring the bell twice");
    await page.getByRole("button", { name: "Next" }).click();

    // Step 6: verify phone via OTP.
    await page.getByLabel("Phone number").fill(phoneDigits);
    await page.getByRole("button", { name: "Send code" }).click();
    // The "Your name"/code fields only render once `requestOtp` has
    // actually resolved — waiting on them (rather than racing the debug
    // fetch against the in-flight mutation) is what makes the code below
    // reliably exist yet.
    await page.getByLabel("Your name").waitFor();

    const debugRes = await request.get(`${API_BASE_URL}/auth/otp/debug`, { params: { phone } });
    expect(debugRes.ok()).toBeTruthy();
    const { code } = (await debugRes.json()) as { code: string };

    await page.getByLabel("Your name").fill(name);
    await page.getByLabel("6-digit code").fill(code);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText("Phone verified.")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

}

test.describe("Booking wizard", () => {
  test("a first-time customer can book end to end, verify by phone, and land on their tracking link", async ({
    page,
    request,
  }) => {
    await bookUpToConfirm(page, request);

    // Step 7: review & confirm.
    await expect(page.getByText("Sai Krupa Residency", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Confirm booking" }).click();

    await expect(page.getByRole("heading", { name: "Booking confirmed!" })).toBeVisible();
    const trackLink = page.getByRole("link", { name: "Track your order" });
    await expect(trackLink).toBeVisible();
    const href = await trackLink.getAttribute("href");
    expect(href).toMatch(/^\/track\//);

    // The link actually resolves — same order, no login required.
    await trackLink.click();
    await expect(page.getByText("Scheduled").first()).toBeVisible();
  });

  test("an unserviceable pincode blocks progress with a clear message", async ({ page }) => {
    await page.goto("/book");
    await page.getByLabel("Pincode").fill("110001");
    await expect(page.getByText(/we don't deliver to this pincode yet/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  });
  test("a shared referral link pre-fills the code and attributes the customer to that partner", async ({
    page,
    request,
  }) => {
    const name = uniqueName("Ref");
    await bookUpToConfirm(page, request, { url: "/book?ref=DEMOWATCH", name });
    await expect(page.getByLabel("Referral code (optional)")).toHaveValue("DEMOWATCH");
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page.getByRole("heading", { name: "Booking confirmed!" })).toBeVisible();

    const attribution = await latestFirstTouch(request, name);
    expect(attribution.channel_code).toBe("WATCHMAN");
    expect(attribution.code).toBe("DEMOWATCH");
    expect(attribution.basis).toBe("CODE");
  });

  test("'How did you hear about us?' is recorded when no code is used", async ({
    page,
    request,
  }) => {
    const name = uniqueName("Said");
    await bookUpToConfirm(page, request, { name });
    await page.getByLabel("How did you hear about us? (optional)").click();
    await page.getByRole("option", { name: "A flyer or poster" }).click();
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page.getByRole("heading", { name: "Booking confirmed!" })).toBeVisible();

    const attribution = await latestFirstTouch(request, name);
    expect(attribution.channel_code).toBe("FLYER");
    expect(attribution.basis).toBe("SELF_REPORTED");
  });

  test("booking with nothing said still gets a channel, flagged as unknown", async ({
    page,
    request,
  }) => {
    const name = uniqueName("Silent");
    await bookUpToConfirm(page, request, { name });
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page.getByRole("heading", { name: "Booking confirmed!" })).toBeVisible();

    const attribution = await latestFirstTouch(request, name);
    expect(attribution.channel_code).toBe("ORGANIC");
    expect(attribution.basis).toBe("DEFAULT");
  });
});

/** The newest first-touch attribution for a customer of this name, read as
 * an operator (the booking customer has no console access). Each booking
 * creates a brand-new customer, so "newest" is this test's own. */
async function latestFirstTouch(
  request: import("@playwright/test").APIRequestContext,
  customerName: string
) {
  const login = await request.post(`${API_BASE_URL}/auth/login`, {
    data: { email: DEMO_USERS.operator.email, password: DEMO_USERS.operator.password },
  });
  expect(login.ok()).toBeTruthy();
  const res = await request.get(`${API_BASE_URL}/growth/attributions/`, {
    params: { is_first_touch: "true" },
  });
  expect(res.ok()).toBeTruthy();
  const rows = ((await res.json()) as { results: Record<string, string>[] }).results;
  const mine = rows.find((r) => r.customer_name === customerName);
  if (!mine) throw new Error(`No first-touch attribution for ${customerName}`);
  return mine;
}

/** A name no other booking in this run shares (tests run in parallel and
 * each booking creates its own customer). */
function uniqueName(tag: string) {
  return `${tag} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}


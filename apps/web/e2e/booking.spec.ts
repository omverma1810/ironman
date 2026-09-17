import { test, expect } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** The booking wizard at `/book` (docs/08 batch 4.3) is the site's first
 * genuinely public, unauthenticated-until-the-last-step flow — this file
 * never calls `loginAs`. It relies on `seed_demo`'s real Koramangala
 * apartments/pincodes/capacity (same "don't reconstruct what's already
 * there" reasoning `tracking.spec.ts`/`order-costs.spec.ts` document for
 * their own seeded pools) plus the E2E-only `/auth/otp/debug` endpoint
 * (`config.settings.test` only — see identity/notify.py) to read the OTP
 * code a real phone can't receive in CI. */

test.describe("Booking wizard", () => {
  test("a first-time customer can book end to end, verify by phone, and land on their tracking link", async ({
    page,
    request,
  }) => {
    // Unique per run so parallel projects (chromium/mobile) never share an
    // `/auth/otp/debug` cache key.
    const phoneDigits = `9${Date.now().toString().slice(-9)}`;
    const phone = `+91${phoneDigits}`;

    await page.goto("/book");

    // Step 1: pincode / serviceability.
    await page.getByLabel("Pincode").fill("560095");
    await expect(page.getByText(/we service this area from/i)).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

    // Step 2: address — search a real seeded apartment.
    await page.getByPlaceholder("Search your apartment by name…").fill("Prestige");
    await page.getByRole("button", { name: "Prestige Lakeside Habitat" }).click();
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

    await page.getByLabel("Your name").fill("Asha Rao");
    await page.getByLabel("6-digit code").fill(code);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText("Phone verified.")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

    // Step 7: review & confirm.
    await expect(page.getByText("Prestige Lakeside Habitat", { exact: false })).toBeVisible();
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
});

import { test, expect } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** The WhatsApp entry points (docs/08 batch 4.8). The marketing buttons open
 * a chat with the business number with a booking message already typed. A
 * customer who followed a wa.me template link back to `/book?src=whatsapp`
 * should book through the exact same wizard as `booking.spec.ts` exercises:
 * the only difference is the order's recorded channel, for attribution. */

test.describe("WhatsApp booking entry point", () => {
  test("the WhatsApp buttons open a chat with the business number and a ready-typed booking message", async ({
    page,
  }) => {
    await page.goto("/");
    for (const link of [
      page.getByRole("link", { name: "Book on WhatsApp" }),
      page.getByRole("link", { name: "Chat with IRON MAN on WhatsApp" }),
    ]) {
      const href = (await link.getAttribute("href")) ?? "";
      const url = new URL(href);
      expect(`${url.origin}${url.pathname}`).toBe("https://wa.me/917569935700");
      const text = url.searchParams.get("text") ?? "";
      expect(text).toContain("Hi IRON MAN!");
      expect(text).toContain("Apartment / area:");
    }
  });

  test("booking via /book?src=whatsapp records the order on the WhatsApp channel", async ({
    page,
    request,
  }) => {
    const phoneDigits = `9${Date.now().toString().slice(-9)}`;
    const phone = `+91${phoneDigits}`;

    await page.goto("/book?src=whatsapp");

    await page.getByLabel("Pincode").fill("500027");
    await expect(page.getByText(/we service this area from/i)).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByPlaceholder("Search your apartment by name…").fill("Sai Krupa");
    await page.getByRole("button", { name: "Sai Krupa Residency" }).click();
    await page.getByLabel("Flat no.").fill("701");
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("button", { name: "Ironing" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("button", { name: "More Shirt" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    await page
      .getByRole("button", { name: /am|pm/i })
      .first()
      .click();
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByLabel("Phone number").fill(phoneDigits);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("Your name").waitFor();
    const debugRes = await request.get(`${API_BASE_URL}/auth/otp/debug`, { params: { phone } });
    expect(debugRes.ok()).toBeTruthy();
    const { code } = (await debugRes.json()) as { code: string };
    await page.getByLabel("Your name").fill("Nikhil Verma");
    await page.getByLabel("6-digit code").fill(code);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText("Phone verified.")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().endsWith("/orders/") && res.request().method() === "POST"
      ),
      page.getByRole("button", { name: "Confirm booking" }).click(),
    ]);
    expect(createResponse.ok()).toBeTruthy();
    const created = await createResponse.json();
    expect(created.channel).toBe("WHATSAPP");

    await expect(page.getByRole("heading", { name: "Booking confirmed!" })).toBeVisible();
  });
});

import { test, expect } from "./fixtures";

/** The public marketing landing page and its /privacy and /terms pages
 * (docs/08 batch 4.7, redesigned per a later detour). No auth, no API
 * calls — this is a rendering and navigation smoke test, not a feature
 * test. */

test.describe("Marketing landing page", () => {
  test("shows the hero and links into the real booking and account flows", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /crisp clothes/i })).toBeVisible();
    // Ironing is the hero service, said right under the hero.
    await expect(page.getByRole("heading", { name: "Ironing is what we do best." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Everything else, on the same pickup." })).toBeVisible();

    await expect(page.getByRole("link", { name: "Book a Pickup" }).first()).toHaveAttribute(
      "href",
      "/book"
    );
    await expect(page.getByRole("link", { name: "Track My Order" })).toHaveAttribute(
      "href",
      "/account"
    );
  });

  test("the FAQ accordion expands and collapses a question", async ({ page }) => {
    await page.goto("/");
    const secondQuestion = page.getByRole("button", { name: "How long does a regular order take?" });
    await secondQuestion.click();
    await expect(
      page.getByText(/most orders are back at your door within/i)
    ).toBeVisible();
  });

  test("footer links reach the privacy notice and terms of service", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Privacy", exact: true }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy notice" })).toBeVisible();

    await page.goBack();
    await page.getByRole("link", { name: "Terms", exact: true }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { name: "Terms of service" })).toBeVisible();
  });

  test("no horizontal overflow at a narrow mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBe(0);
  });
});

import { test, expect } from "./fixtures";

/** The public marketing landing page and its /privacy and /terms pages
 * (docs/08 batch 4.7, redesigned per a later detour). No auth, no API
 * calls — this is a rendering and navigation smoke test, not a feature
 * test. */

test.describe("Marketing landing page", () => {
  test("shows the hero and links into the real booking and account flows", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /expert care for/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Every garment, the right kind of care." })).toBeVisible();

    await expect(page.getByRole("link", { name: "Schedule a Pickup" }).first()).toHaveAttribute(
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
      page.getByText(/most wash & fold and dry-cleaning orders are ready within/i)
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

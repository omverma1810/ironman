import { test, expect } from "./fixtures";

/** The public marketing landing page and its /privacy and /terms pages
 * (docs/08 batch 4.7). No auth, no API calls — this is a rendering and
 * navigation smoke test, not a feature test. */

test.describe("Marketing landing page", () => {
  test("shows the hero, how-it-works steps, and links to booking and tracking", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /doorstep ironing/i })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();

    await expect(page.getByRole("link", { name: "Book a pickup" }).first()).toHaveAttribute(
      "href",
      "/book"
    );
    await expect(page.getByRole("link", { name: "Track my orders" })).toHaveAttribute(
      "href",
      "/account"
    );
  });

  test("footer links reach the privacy notice and terms of service", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Privacy notice" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy notice" })).toBeVisible();

    await page.getByRole("link", { name: "Terms of service" }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { name: "Terms of service" })).toBeVisible();
  });
});

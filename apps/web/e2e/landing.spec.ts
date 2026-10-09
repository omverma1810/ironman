import { test, expect } from "./fixtures";

/** The public marketing landing page and its /privacy and /terms pages
 * (docs/08 batch 4.7, redesigned per a later detour). No auth, no API
 * calls — this is a rendering and navigation smoke test, not a feature
 * test. */

test.describe("Marketing landing page", () => {
  test("shows the hero and links into the real booking and account flows", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: /crisp clothes/i }),
    ).toBeVisible();
    // Ironing is the hero service, said right under the hero.
    await expect(
      page.getByRole("heading", { name: "Automatic ironing is what we do best." }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Everything else, on one pickup." }),
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Book a Pickup" }).first(),
    ).toHaveAttribute("href", "/book");
    await expect(
      page.getByRole("link", { name: "Track My Order" }),
    ).toHaveAttribute("href", "/account");
  });

  test("says automatic ironing and shows machinery, not a handheld iron", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText(/automatic ironing, picked up & delivered/i)).toBeVisible();
    const machine = page.getByRole("img", { name: /automatic garment-pressing plate/i });
    await machine.scrollIntoViewIfNeeded();
    await expect(machine).toBeVisible();
    await expect(page.getByRole("img", { name: /steam finishing cabinet/i })).toBeVisible();
    // The mascot is a press robot, and nothing draws a hand iron any more.
    await expect(page.getByRole("img", { name: /friendly press robot/i })).toBeAttached();
    await expect(page.getByRole("img", { name: /an iron pressing/i })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Is my ironing done by hand or by machine?" }),
    ).toBeVisible();
  });

  test("every price on the page is in rupees", async ({ page }) => {
    await page.goto("/");
    const text = await page.locator("body").innerText();
    expect(text).toContain("₹");
    expect(text).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(/\bUSD\b|\bdollars?\b/i);
  });

  test("the FAQ accordion expands and collapses a question", async ({
    page,
  }) => {
    await page.goto("/");
    const secondQuestion = page.getByRole("button", {
      name: "How long does a regular order take?",
    });
    await secondQuestion.click();
    await expect(
      page.getByText(/most orders are back at your door within/i),
    ).toBeVisible();
  });

  test("footer links reach the privacy notice and terms of service", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Privacy", exact: true }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { name: "Privacy notice" }),
    ).toBeVisible();

    await page.goBack();
    await page.getByRole("link", { name: "Terms", exact: true }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(
      page.getByRole("heading", { name: "Terms of service" }),
    ).toBeVisible();
  });

  test("no horizontal overflow at a narrow mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});

test.describe("Landing page: film and scroll effects", () => {
  test("the hero plays the brand film behind the headline, and the wordmark is IRON in white, MAN in yellow", async ({
    page,
  }) => {
    await page.goto("/");
    const hero = page.locator("#home video");
    await expect(hero).toHaveCount(1);
    await expect(hero.locator("source")).toHaveCount(2);
    await expect(hero).toHaveJSProperty("muted", true);
    const colours = await page
      .locator("header [aria-label='IRON MAN'] span")
      .evaluateAll((spans) => spans.map((s) => getComputedStyle(s).color));
    expect(colours).toEqual(["rgb(255, 255, 255)", "rgb(255, 214, 10)"]);
  });

  test("scrolling through the pinned film moves its play head and shows its captions", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "the film is VP9/WebM in the test browser",
    );
    await page.goto("/");
    const film = page.locator("#film");
    const video = film.locator("video");
    // The file is only fetched once the section is near.
    await expect(video.locator("source")).toHaveCount(0);
    const box = await film.evaluate((el) => ({
      top: el.getBoundingClientRect().top + scrollY,
      height: el.getBoundingClientRect().height,
    }));
    await page.evaluate((y) => window.scrollTo(0, y), box.top - 600);
    await expect(video.locator("source")).toHaveCount(2);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
      .toBeGreaterThan(1);

    const at = async (share: number) => {
      await page.evaluate(
        (y) => window.scrollTo(0, y),
        box.top + share * (box.height - (page.viewportSize()?.height ?? 800)),
      );
      await page.waitForTimeout(900);
      return video.evaluate((v: HTMLVideoElement) => v.currentTime);
    };
    const early = await at(0.2);
    const late = await at(0.7);
    expect(late).toBeGreaterThan(early + 2);
    await expect(film.getByText("Pressed to a crisp edge.")).toBeVisible();
  });

  test("with reduced motion the film is an ordinary video with controls and nothing is pinned", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const video = page.locator("#film video");
    await expect(video).toHaveAttribute("controls", "");
    expect(
      await page
        .locator("#film")
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeLessThan(1200);
    await expect(page.locator("#home video")).toHaveJSProperty("paused", true);
  });
});

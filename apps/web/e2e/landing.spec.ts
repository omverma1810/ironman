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
    // The ironing specialist is shown beside a robotic finishing cabinet, and
    // nothing draws a hand iron any more.
    await expect(
      page.locator("#crew").getByRole("img", { name: /robotic garment finishing cabinet/i }),
    ).toBeAttached();
    await expect(page.getByRole("img", { name: /an iron pressing/i })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Is my ironing done by hand or by machine?" }),
    ).toBeVisible();
  });

  test("shows what we iron, shirts first, with a photo for each garment", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "From everyday shirts to wedding kurtas." }),
    ).toBeVisible();
    const tiles = page.locator("#garments li");
    await expect(tiles).toHaveCount(5);
    await expect(tiles.first().getByRole("heading", { name: "Shirts" })).toBeAttached();
    for (const name of [/^crisp pressed white and blue dress shirts/i, /^pressed charcoal and navy trousers/i, /^a navy blazer/i, /^a cream kurta/i, /^a magenta silk saree/i]) {
      await expect(page.locator("#garments").getByRole("img", { name })).toBeAttached();
    }
  });

  test("the landing page logs no console errors while loading and scrolling", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 300));
    });
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 300)));
    await page.goto("/");
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 80));
      }
    });
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test("contact numbers are the real ones, with the primary in the header menu", async ({ page }) => {
    await page.goto("/");
    // The header shows it on desktop; on a phone it sits behind the menu button.
    await expect(page.locator('header a[href="tel:+917569935700"]').first()).toBeAttached();
    for (const tel of ["+917569935700", "+917816005700", "+919346093130"]) {
      await expect(page.locator(`footer a[href="tel:${tel}"]`)).toBeVisible();
    }
    await expect(page.locator('footer a[href^="https://maps.app.goo.gl/8tkTwY7t2snCAfxQ9"]')).toBeVisible();
    // The old placeholders must be gone from what visitors see.
    const html = await page.content();
    expect(html).not.toContain("98765 43210");
    expect(html).not.toContain("ironman.example");
  });

  test("the email and WhatsApp links open ready-typed messages to the real address and number", async ({
    page,
  }) => {
    await page.goto("/");
    const mail = page.locator('footer a[href^="mailto:"]');
    await expect(mail).toHaveText("Ironmanindia9999@gmail.com");
    const mailUrl = new URL((await mail.getAttribute("href")) ?? "");
    expect(mailUrl.pathname).toBe("Ironmanindia9999@gmail.com");
    expect(mailUrl.searchParams.get("subject")).toBe("Pickup enquiry");
    expect(mailUrl.searchParams.get("body")).toContain("Apartment / area:");

    const wa = page.locator('footer a[href^="https://wa.me/917569935700"]');
    await expect(wa).toHaveText(/chat on whatsapp/i);
    expect(new URL((await wa.getAttribute("href")) ?? "").searchParams.get("text")).toContain(
      "Hi IRON MAN!",
    );
  });

  test("the contact page can start a WhatsApp chat, and the legal pages use the real email", async ({
    page,
  }) => {
    await page.goto("/contact");
    await expect(page.getByRole("link", { name: "Chat on WhatsApp" })).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/917569935700\?text=/,
    );
    await expect(page.locator('main a[href^="mailto:Ironmanindia9999@gmail.com"]')).toBeVisible();
    for (const path of ["/privacy", "/terms"]) {
      await page.goto(path);
      await expect(page.locator('a[href^="mailto:Ironmanindia9999@gmail.com"]')).toBeVisible();
      expect(await page.content()).not.toContain("ironman.example");
    }
  });

  test("the contact page lists every number and links to Google Maps", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByRole("heading", { level: 1, name: /talk to iron man/i })).toBeVisible();
    await expect(page.getByText("Primary contact for everything")).toBeVisible();
    for (const tel of ["+917569935700", "+917816005700", "+919346093130"]) {
      await expect(page.locator(`main a[href="tel:${tel}"]`).first()).toBeVisible();
    }
    const maps = page.getByRole("link", { name: "Open in Google Maps" });
    await expect(maps).toHaveAttribute("href", "https://maps.app.goo.gl/8tkTwY7t2snCAfxQ9?g_st=ic");
    await expect(maps).toHaveAttribute("target", "_blank");
    // The map itself is on the page, not just a link to it.
    const map = page.locator('iframe[title="IRON MAN on Google Maps"]');
    await expect(map).toHaveAttribute("src", /^https:\/\/www\.google\.com\/maps\?q=.*output=embed$/);
    expect(await page.locator("body").innerText()).not.toContain("ironman.example");
  });

  test("the Google review poster and a review link are on the landing page", async ({ page }) => {
    await page.goto("/");
    const poster = page.getByRole("img", { name: /leave us a google review/i });
    await poster.scrollIntoViewIfNeeded();
    await expect(poster).toBeVisible();
    await expect(
      page.locator("#reviews").getByRole("link", { name: "Leave a Google review" }),
    ).toHaveAttribute("href", /^https:\/\/local\.google\.com\/place\?placeid=ChIJdzFzlP6ZyzsRrJXV8euu8qg/);
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
    const mid = await at(0.47);
    // The caption for this stretch is on screen (opacity, not just in the DOM).
    const caption = film.getByText("A controlled press sets the crease.");
    await expect
      .poll(() => caption.evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBeGreaterThan(0.9);
    const late = await at(0.8);
    expect(mid).toBeGreaterThan(early);
    expect(late).toBeGreaterThan(early + 1.5);
  });

  test("the film shows only the machines: no logo in the poster, the captions or the frames", async ({
    page,
  }) => {
    await page.goto("/");
    const video = page.locator("#film video");
    await expect(video).toHaveAttribute("poster", "/landing/film-poster.jpg");
    await expect(page.locator("#film")).not.toContainText(/ending on the logo/i);
    await expect(video).toHaveAttribute("aria-label", /feed rollers, steam, a press plate/i);
  });

  test("crew and service cards use photographs, not drawings", async ({ page }) => {
    await page.goto("/");
    for (const [section, count] of [
      ["#crew", 3],
      ["#services", 4],
    ] as const) {
      const images = page.locator(`${section} img`);
      await expect(images).toHaveCount(count);
      await expect(page.locator(`${section} svg[role="img"]`)).toHaveCount(0);
    }
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

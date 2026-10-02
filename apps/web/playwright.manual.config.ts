import { defineConfig } from "@playwright/test";

/** Regenerates the user-manual screenshots and access matrix
 * (docs/user-manual). Not part of CI — run by hand against a freshly
 * seeded local stack:
 *
 *   npx playwright test -c playwright.manual.config.ts
 */
export default defineConfig({
  testDir: "./scripts/manual",
  workers: 1,
  timeout: 300_000,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH
      ? {
          launchOptions: {
            executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium-1194/chrome-linux/chrome`,
          },
        }
      : {}),
  },
});

import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config (docs/10 §2 "the six critical flows"). Runs against the dev
 * server directly — CI starts both the Django API and this app before
 * invoking the suite (see .github/workflows/ci.yml).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // A single `next dev` + a single Django `runserver` back this suite —
  // neither is built for high concurrency, so cap workers regardless of
  // CI/local rather than defaulting to one-per-core.
  workers: 4,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // This sandbox pre-installs one pinned Chromium revision at a fixed
    // path rather than letting Playwright download its own (network
    // egress to Playwright's CDN is blocked here). CI/production
    // environments with normal network access should drop this and let
    // Playwright manage its own browser binaries as usual.
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH
      ? { launchOptions: { executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium-1194/chrome-linux/chrome` } }
      : {}),
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});

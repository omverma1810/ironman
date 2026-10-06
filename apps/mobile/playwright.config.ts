import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the customer app, run against its web build (the same
 * React Native screens through react-native-web) with the Django API live.
 * What this can't see is native behaviour: the keychain, the camera, push.
 * Build it first with `npm run export:web --workspace=apps/mobile`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8081",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH
      ? { launchOptions: { executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium-1194/chrome-linux/chrome` } }
      : {}),
  },
  webServer: {
    command: "node scripts/serve-web.mjs",
    url: "http://localhost:8081",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
});

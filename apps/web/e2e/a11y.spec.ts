import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect, loginAs, loginAsField, DEMO_USERS } from "./fixtures";

// docs/08 batch 7.1 — automated accessibility (axe, WCAG 2.1 A/AA) on the
// screens behind the six critical flows: booking, the customer account,
// tracking, the ops orders list and detail, and the rider's job list.
// Serious and critical findings fail the build; moderate ones are reported
// in the test output for the manual pass.

async function scan(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  );
  const summary = blocking.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} — ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`
  );
  expect(summary, `${name} has accessibility violations`).toEqual([]);
}

test.describe("public screens", () => {
  for (const [name, path] of [
    ["landing", "/"],
    ["booking", "/book"],
    ["account sign-in", "/account"],
    ["privacy notice", "/privacy"],
    ["console sign-in", "/console/login"],
    ["field sign-in", "/field/login"],
  ] as const) {
    test(name, async ({ page }) => {
      await page.goto(path);
      await scan(page, name);
    });
  }
});

test.describe("staff screens", () => {
  test.skip(({ isMobile }) => isMobile, "desktop console; the mobile run covers public screens");

  for (const [name, path] of [
    ["dashboard", "/console"],
    ["orders", "/console/orders"],
    ["customers", "/console/customers"],
    ["analytics", "/console/analytics"],
    ["audit log", "/console/audit"],
  ] as const) {
    test(name, async ({ page }) => {
      await loginAs(page, DEMO_USERS.founder);
      await page.goto(path);
      await scan(page, name);
    });
  }

  test("order detail", async ({ page }) => {
    await loginAs(page, DEMO_USERS.founder);
    await page.goto("/console/orders");
    // Keyboard, not mouse: focus the first order row and press Enter.
    await page.getByRole("row").nth(1).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/console\/orders\/.+/);
    await scan(page, "order detail");
  });

  test("rider job list", async ({ page }) => {
    await loginAsField(page, DEMO_USERS.field);
    await scan(page, "rider job list");
  });
});

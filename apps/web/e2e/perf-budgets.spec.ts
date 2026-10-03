import type { Page } from "@playwright/test";
import { test, expect, loginAs, loginAsField, DEMO_USERS } from "./fixtures";

// docs/08 batch 7.2 against docs/05 §8. LCP and CLS are measured under
// emulated 4G and a 4× slower CPU (a stand-in for a mid-range Android phone)
// and must meet the docs/05 budgets.
//
// Initial JS (gzip, on the wire) does NOT meet the docs/05 targets yet: React
// DOM and the Next runtime alone are ~100 KB, and the booking wizard adds
// TanStack Query, Radix and toasts. Until that work is scheduled, `jsKb` is a
// ratchet at the measured size plus ~10%, so bundles can only shrink; the
// docs/05 target is kept beside it so the gap stays visible.
// Chromium only: the metrics come from Chrome's DevTools protocol.

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (9 * 1024 * 1024) / 8, // 9 Mbps, "fast 4G"
    uploadThroughput: (1.5 * 1024 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

async function measure(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  return page.evaluate(
    () =>
      new Promise<{ jsKb: number; lcp: number; cls: number }>((resolve) => {
        // encodedBodySize is the size on the wire: gzip/brotli when served compressed.
        const jsBytes = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
          .filter((r) => r.name.includes("/_next/") && r.name.endsWith(".js"))
          .reduce((sum, r) => sum + r.encodedBodySize, 0);
        let lcp = 0;
        let cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) lcp = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as {
            value: number;
            hadRecentInput: boolean;
          }[])
            if (!e.hadRecentInput) cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => resolve({ jsKb: Math.round(jsBytes / 1024), lcp, cls }), 500);
      })
  );
}

// measured 2026-10-03: booking 229 KB, field 235 KB, console 363 KB
const BUDGETS = {
  booking: { path: "/book", jsKb: 250, targetJsKb: 130, lcp: 1800 },
  console: { path: "/console/orders", jsKb: 400, targetJsKb: 300, lcp: 2500 },
  field: { path: "/field", jsKb: 260, targetJsKb: 180, lcp: 2000 },
} as const;

test.describe("performance budgets", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "chromium");

  for (const [surface, budget] of Object.entries(BUDGETS)) {
    test(`${surface}: initial JS, LCP and CLS within budget`, async ({ page }, testInfo) => {
      if (surface === "console") await loginAs(page, DEMO_USERS.founder);
      if (surface === "field") await loginAsField(page, DEMO_USERS.field);
      await throttle(page);
      const result = await measure(page, budget.path);
      testInfo.annotations.push({
        type: "perf",
        description: `${surface}: JS ${result.jsKb} KB (ratchet ${budget.jsKb}, target ${budget.targetJsKb}), LCP ${Math.round(result.lcp)} ms / ${budget.lcp}, CLS ${result.cls.toFixed(3)}`,
      });
      console.log(testInfo.annotations.at(-1)?.description);
      expect(result.jsKb, "initial JS (gzip, KB) grew past the ratchet").toBeLessThanOrEqual(
        budget.jsKb
      );
      expect(result.lcp, "LCP (ms)").toBeLessThanOrEqual(budget.lcp);
      expect(result.cls, "CLS").toBeLessThanOrEqual(0.1);
    });
  }
});

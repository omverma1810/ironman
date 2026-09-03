import { test, expect, DEMO_USERS, loginAsField } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

// playwright.config.ts runs exactly two projects (chromium, mobile) against
// this one seeded backend — keep in sync if that ever changes.
const PROJECT_NAMES = ["chromium", "mobile"];

type Job = { id: string; kind: "PICKUP" | "DELIVERY"; status: string };

/** This project's slice of the seeded PENDING pickups / EN_ROUTE deliveries,
 * fixed once per project run (`beforeAll`, not re-fetched per test) so
 * later tests in this file aren't picking against a pool their own
 * earlier tests — or the other project's tests — have already shrunk.
 * Split by `sortedIndex % PROJECT_NAMES.length`, one slice per
 * concurrently-running Playwright project, computed from one snapshot
 * taken before either project has mutated anything. */
let pendingPickupIds: string[] = [];
let enRouteDeliveryIds: string[] = [];

test.describe("Field PWA", () => {
  // `beforeAll` runs once per *worker*. When the whole suite (many spec
  // files) runs together, `testInfo.parallelIndex` is a global worker id —
  // not a project id — so two different workers can land on the same
  // `parallelIndex % PROJECT_NAMES.length` and independently compute the
  // same "bucket", colliding on the same job ids. `testInfo.project.name`
  // is what's actually stable per project regardless of worker count.
  // `serial` still matters: it keeps this file's own 4 tests from running
  // concurrently within one project and racing each other's fetch/mutate.
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }, testInfo) => {
    const login = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: DEMO_USERS.field.email, password: DEMO_USERS.field.password },
    });
    expect(login.ok()).toBeTruthy();
    const res = await request.get(`${API_BASE_URL}/fulfilment/jobs/mine/`);
    const jobs = ((await res.json()) as Job[]).slice().sort((a, b) => (a.id < b.id ? -1 : 1));

    const projectIndex = PROJECT_NAMES.indexOf(testInfo.project.name);
    if (projectIndex === -1) {
      throw new Error(
        `Unknown Playwright project "${testInfo.project.name}" — add it to PROJECT_NAMES in field.spec.ts`
      );
    }
    const mine = (kind: Job["kind"], status: string) =>
      jobs
        .filter((j) => j.kind === kind && j.status === status)
        .filter((_, i) => i % PROJECT_NAMES.length === projectIndex)
        .map((j) => j.id);
    pendingPickupIds = mine("PICKUP", "PENDING");
    enRouteDeliveryIds = mine("DELIVERY", "EN_ROUTE");
  });

  test.beforeEach(async ({ page }) => {
    await loginAsField(page, DEMO_USERS.field);
  });

  test("today's jobs render, and a pickup can be started, arrived and completed", async ({ page }) => {
    await expect(page.getByText("Today")).toBeVisible();
    await expect(page.locator("a", { hasText: "Not started" }).first()).toBeVisible();

    await page.goto(`/field/jobs/${pendingPickupIds[0]}`);
    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(page.getByRole("button", { name: "Arrived" })).toBeVisible();

    await page.getByRole("button", { name: "Arrived" }).click();
    await expect(page.getByRole("button", { name: /^Complete/ })).toBeVisible();

    await page.getByRole("button", { name: /^Complete pickup/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pickup");
    await expect(page.locator("span", { hasText: "Done" })).toBeVisible();
  });

  test("a delivery can be completed by scanning a bag code", async ({ page, request }) => {
    await page.goto(`/field/jobs/${enRouteDeliveryIds[0]}`);
    await expect(page.getByRole("button", { name: "Arrived" })).toBeVisible();

    // Delivery completion validates the scanned code against the order's
    // own bags server-side (custody.services.verify_bag_codes) — a made-up
    // code is correctly rejected, so fetch this order's real one. Bag
    // lookup is ops-staff-only (BagViewSet's IsOpsStaff), not something a
    // rider's own session can call, so this uses a separate operator
    // session via the `request` fixture rather than the page's own cookies.
    const heading = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";
    const orderRef = heading.split("—")[1]?.trim() ?? "";

    const login = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: DEMO_USERS.operator.email, password: DEMO_USERS.operator.password },
    });
    expect(login.ok()).toBeTruthy();
    const ordersRes = await request.get(`${API_BASE_URL}/orders/`, { params: { search: orderRef } });
    const order = (await ordersRes.json()).results.find((o: { ref: string }) => o.ref === orderRef);
    const bagsRes = await request.get(`${API_BASE_URL}/custody/bags/`, { params: { order: order.id } });
    const bagCode = (await bagsRes.json()).results[0]?.code;
    if (!bagCode) throw new Error(`No seeded bag found for order ${orderRef}`);

    await page.getByRole("button", { name: "Arrived" }).click();
    await page.getByPlaceholder("Scan or type a bag code…").fill(bagCode);
    await page.getByPlaceholder("Scan or type a bag code…").press("Enter");
    await expect(page.getByText(bagCode)).toBeVisible();

    await page.getByRole("button", { name: /^Complete delivery/ }).click();
    await expect(page.locator("span", { hasText: "Done" })).toBeVisible();
  });

  test("logging out returns to the field login page and re-guards /field", async ({ page }) => {
    await page.goto("/field");
    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL("**/field/login");

    // Regression check: FieldShell's own auth guard only redirected on a
    // real 401/403 from /me, not on the deliberate `me: null` a logout
    // leaves behind — so this used to land on a blank page instead.
    await expect(page.getByRole("heading", { name: "IronMan Field" })).toBeVisible();

    await page.goto("/field");
    await page.waitForURL("**/field/login");
  });

  test("reporting a problem marks the job failed", async ({ page }) => {
    await page.goto(`/field/jobs/${pendingPickupIds[1]}`);

    await page.getByRole("button", { name: "Report a problem" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Report a problem" })).toBeVisible();
    await dialog.getByRole("button", { name: "Mark failed" }).click();

    await expect(page.getByText(/marked failed/i)).toBeVisible();
  });

  test("a job action taken with no signal is queued and syncs once back online", async ({
    page,
    context,
  }) => {
    // A third distinct pending pickup, same as the two tests above — but
    // that pool is the tightest one this file draws from, so fall back to
    // a second EN_ROUTE delivery (exercising "arrive" instead of "start",
    // equally valid coverage of the same offline-aware mutation code path)
    // rather than fail outright if this project's slice came up short.
    const usingPickup = !!pendingPickupIds[2];
    const jobId = usingPickup ? pendingPickupIds[2] : enRouteDeliveryIds[1];
    if (!jobId) throw new Error("No spare pending pickup or en-route delivery for the offline test");
    await page.goto(`/field/jobs/${jobId}`);

    // Let the page's own data load (job/order/proofs) finish online, so
    // going offline tests the *action*, not a cold load with no signal.
    const primaryAction = page.getByRole("button", { name: usingPickup ? /^Start/ : "Arrived" });
    await expect(primaryAction).toBeVisible();

    // Matched narrowly: the mutation also fires a "no signal" toast, and a
    // plain /no signal/i text match would resolve to both it and this
    // persistent header banner.
    const offlineBanner = page.getByText(/no signal.*your actions are being saved/i);

    await context.setOffline(true);
    await primaryAction.click();
    await expect(offlineBanner).toBeVisible();
    const nextState = usingPickup
      ? page.getByRole("button", { name: "Arrived" })
      : page.getByRole("button", { name: /^Complete/ });
    await expect(nextState).toBeVisible();

    await context.setOffline(false);
    await expect(offlineBanner).toBeHidden();
  });
});

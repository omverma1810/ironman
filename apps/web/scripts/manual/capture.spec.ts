import fs from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs, loginAsField } from "../../e2e/fixtures";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
const OUT = path.resolve(__dirname, "../../../../docs/user-manual");
const IMG = path.join(OUT, "img");
const DESKTOP = { width: 1366, height: 820 };
const PHONE = { width: 390, height: 844 };

async function shot(page: Page, name: string, opts: { full?: boolean } = {}) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400); // let entry animations settle
  // The global error boundary must never appear in a manual screenshot.
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
  await page.screenshot({
    path: path.join(IMG, `${name}.jpg`),
    type: "jpeg",
    quality: 82,
    fullPage: opts.full ?? false,
  });
}

async function api<T>(req: APIRequestContext, p: string, params?: Record<string, string>) {
  const res = await req.get(`${API}${p}`, { params });
  expect(res.ok(), `${p} -> ${res.status()}`).toBeTruthy();
  return (await res.json()) as T;
}

type Page_<T> = { results: T[] };

test.beforeAll(() => fs.mkdirSync(IMG, { recursive: true }));

test("console as founder", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();

  await page.goto("/console/login");
  await shot(page, "01-login");
  await loginAs(page, DEMO_USERS.founder);
  await shot(page, "02-dashboard");

  const r = page.request;
  const invoices = await api<Page_<{ ref: string; order: string }>>(r, "/billing/invoices/");
  const coded = await api<Page_<{ customer: string }>>(r, "/growth/attributions/", {
    basis: "CODE",
    is_first_touch: "true",
  });

  const visits: [string, string, boolean?][] = [
    ["/console/orders", "03-orders"],
    [`/console/orders/${invoices.results[0].order}`, "04-order-detail", true],
    ["/console/orders/new", "05-new-order"],
    ["/console/production", "06-production"],
    ["/console/customers", "07-customers"],
    [`/console/customers/${coded.results[0]?.customer ?? ""}`, "08-customer-detail"],
    ["/console/exceptions", "09-exceptions"],
    ["/console/route-days", "10-route-days"],
    ["/console/supplies", "11-supplies"],
    ["/console/invoices", "14-invoices"],
    [`/console/invoices/${invoices.results[0].ref}`, "15-invoice-detail"],
    ["/console/cash-reconciliation", "16-cash"],
    ["/console/partners", "17-partners"],
    ["/console/pricing", "18-pricing"],
    ["/console/notifications", "19-notifications"],
    ["/console/analytics", "20-analytics"],
  ];
  for (const [url, name, full] of visits) {
    await page.goto(url);
    await shot(page, name, { full });
  }

  await page.goto("/console/supplies");
  await page.getByRole("tab", { name: "Movements" }).click();
  await shot(page, "12-supplies-movements");
  await page.getByRole("tab", { name: "Consumption rules" }).click();
  await shot(page, "13-supplies-rules");
  await ctx.close();
});

test("console as operator", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  await loginAs(page, DEMO_USERS.operator);
  await page.goto("/console/supplies");
  await shot(page, "21-operator-supplies");
  await page.goto("/console/pricing");
  await shot(page, "22-operator-pricing");
  await ctx.close();
});

test("field app", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/field/login");
  await shot(page, "23-field-login");
  await loginAsField(page, DEMO_USERS.field);
  await shot(page, "24-field-jobs");
  const jobs = await api<Page_<{ id: string }>>(page.request, "/fulfilment/jobs/");
  if (jobs.results[0]) {
    await page.goto(`/field/jobs/${jobs.results[0].id}`);
    await shot(page, "25-field-job");
  }
  await page.goto("/field/cash");
  await shot(page, "26-field-cash");
  await ctx.close();
});

test("customer side", async ({ browser }) => {
  const desk = await browser.newContext({ viewport: DESKTOP });
  const landing = await desk.newPage();
  await landing.goto("/");
  await shot(landing, "27-landing");

  // A tracking link from a seeded order (read as staff, opened as the public).
  const staff = await desk.newPage();
  await loginAs(staff, DEMO_USERS.operator);
  const orders = await api<Page_<{ id: string }>>(staff.request, "/orders/", {
    status: "OUT_FOR_DELIVERY",
  });
  const order = await api<{ tracking_token: string }>(staff.request, `/orders/${orders.results[0].id}/`);
  await desk.close();

  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/book?ref=DEMOWATCH");
  await page.getByLabel("Pincode").fill("500027");
  await expect(page.getByText(/we service this area from/i)).toBeVisible();
  await shot(page, "28-book-start");

  await page.goto(`/track/${order.tracking_token}`);
  await shot(page, "29-tracking", { full: true });

  await page.goto("/account");
  await shot(page, "30-account-signin");
  await ctx.close();
});

/** What each role can actually reach — probed against the live API rather
 * than copied from the docs, so the manual's access table is the truth. */
test("access matrix", async ({ playwright }) => {
  const endpoints: [string, string][] = [
    ["Orders", "/orders/"],
    ["Customers", "/customers/"],
    ["Production (bags)", "/custody/bags/"],
    ["Route days", "/fulfilment/route-days/"],
    ["Delivery/pickup jobs", "/fulfilment/jobs/"],
    ["Exceptions", "/order-exceptions/"],
    ["Stock levels", "/supplies/levels/"],
    ["Stock ledger", "/supplies/movements/"],
    ["Consumption rules", "/supplies/consumption-rules"],
    ["Invoices", "/billing/invoices/"],
    ["Invoice CSV export", "/billing/invoices/export/"],
    ["Cash reconciliation", "/billing/cash/reconciliation"],
    ["Price lists", "/catalog/price-lists/"],
    ["Referral partners", "/growth/partners/"],
    ["Customer attribution", "/growth/attributions/"],
    ["Staff list", "/identity/staff"],
    ["Message log", "/notifications/log/"],
  ];
  const roles = ["founder", "admin", "operator", "field"] as const;
  const matrix: Record<string, Record<string, number>> = {};
  for (const role of roles) {
    const ctx = await playwright.request.newContext();
    const login = await ctx.post(`${API}/auth/login`, {
      data: { email: DEMO_USERS[role].email, password: DEMO_USERS[role].password },
    });
    expect(login.ok(), `${role} login`).toBeTruthy();
    for (const [label, p] of endpoints) {
      const res = await ctx.get(`${API}${p}`);
      expect(res.status(), `${role} ${p} must not 5xx`).toBeLessThan(500);
      (matrix[label] ??= {})[role] = res.status();
    }
    await ctx.dispose();
  }
  fs.writeFileSync(path.join(OUT, "access-matrix.json"), JSON.stringify(matrix, null, 2));
});

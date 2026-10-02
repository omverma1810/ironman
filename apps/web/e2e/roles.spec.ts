import { test, expect, loginAs, loginAsField, DEMO_USERS } from "./fixtures";

/** Crash sweep: every console screen, as every staff role. A screen must
 * either render or show the "no access" state — never the global error
 * boundary, an uncaught exception, or a 5xx from the API. This is the
 * safety net for role changes: a permission narrowed server-side that a
 * screen doesn't handle shows up here as a crash, not in production. */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

const STATIC_ROUTES = [
  "/console",
  "/console/orders",
  "/console/orders/new",
  "/console/production",
  "/console/customers",
  "/console/apartments",
  "/console/exceptions",
  "/console/route-days",
  "/console/supplies",
  "/console/invoices",
  "/console/cash-reconciliation",
  "/console/partners",
  "/console/analytics",
  "/console/pricing",
  "/console/staff",
  "/console/notifications",
  "/console/settings",
];

const ROLES = [
  { name: "operator", user: DEMO_USERS.operator },
  { name: "admin", user: DEMO_USERS.admin },
  { name: "founder", user: DEMO_USERS.founder },
] as const;

for (const role of ROLES) {
  test(`${role.name}: every console screen renders or shows no-access, never crashes`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const problems: string[] = [];
    page.on("pageerror", (err) => problems.push(`uncaught: ${err.message}`));
    page.on("response", (res) => {
      if (res.status() >= 500)
        problems.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    });

    await loginAs(page, role.user);

    // Dynamic screens need real ids — read one of each over the API.
    const first = async (path: string, key: string) => {
      const res = await page.request.get(`${API_BASE_URL}${path}`);
      if (!res.ok()) return null;
      const body = await res.json();
      const row = (body.results ?? body)[0];
      return row ? (row[key] as string) : null;
    };
    const orderId = await first("/orders/", "id");
    const customerId = await first("/customers/", "id");
    const invoiceRef = await first("/billing/invoices/", "ref");
    const routes = [
      ...STATIC_ROUTES,
      ...(orderId ? [`/console/orders/${orderId}`] : []),
      ...(customerId ? [`/console/customers/${customerId}`] : []),
      ...(invoiceRef ? [`/console/invoices/${invoiceRef}`] : []),
    ];

    const denied: string[] = [];
    for (const route of routes) {
      const before = problems.length;
      await page.goto(route);
      // Let the screen's own queries settle before judging it.
      await page.waitForLoadState("networkidle");

      await expect(
        page.getByRole("heading", { name: "Something went wrong" }),
        `${role.name} ${route} hit the global error boundary`
      ).toHaveCount(0);
      // A query-level failure that isn't a clean 403 renders ErrorState.
      await expect(
        page.getByText("Something went wrong loading this."),
        `${role.name} ${route} showed a load error`
      ).toHaveCount(0);

      if (
        await page.getByText(/don.t have access|founder-only|restricted|admin or founder/i).count()
      ) {
        denied.push(route);
      }
      expect(problems.slice(before), `${role.name} ${route}`).toEqual([]);
    }

    test.info().annotations.push({
      type: "no-access screens",
      description: `${role.name}: ${denied.join(", ") || "none"}`,
    });
    expect(problems).toEqual([]);
  });
}

test("field staff: the field app renders and the ops console is closed to them", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("pageerror", (err) => problems.push(`uncaught: ${err.message}`));
  page.on("response", (res) => {
    if (res.status() >= 500) problems.push(`${res.status()} ${res.url()}`);
  });

  await loginAsField(page, DEMO_USERS.field);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);

  // A FIELD-only account has no ops console: the API refuses its data and
  // the console bounces it to login rather than rendering anything.
  await page.goto("/console/orders");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);

  const denied = await page.request.get(`${API_BASE_URL}/supplies/levels/`);
  expect([401, 403]).toContain(denied.status());
  const denied2 = await page.request.get(`${API_BASE_URL}/billing/invoices/export/`);
  expect([401, 403]).toContain(denied2.status());
  expect(problems).toEqual([]);
});

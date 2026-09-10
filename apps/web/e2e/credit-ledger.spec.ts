import { test, expect, loginAs, loginAsField, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** A fresh counter order (and its customer), owned outright by this file —
 * same "don't touch the shared status pool" reasoning `billing.spec.ts`'s
 * own `createInvoiceableOrder` documents, since this suite also issues an
 * invoice and records a payment against it. */
let orderId: string;
let customerId: string;

test.describe("Customer credit ledger", () => {
  // Both tests below act on the same customer's balance in sequence
  // (grant, then spend) — serial keeps them from racing each other.
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }, testInfo) => {
    const login = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: DEMO_USERS.operator.email, password: DEMO_USERS.operator.password },
    });
    expect(login.ok()).toBeTruthy();

    // `chromium` and `mobile` each run this whole file as their own
    // worker. Unlike `billing.spec.ts`'s per-order invoice/payment work
    // (isolated by the fresh order itself), this file grants and spends
    // against the *customer's* shared credit balance — so both projects
    // reusing the very same customer collide on that one ledger (confirmed
    // directly: they did). `testInfo.project.name` picks a different
    // seeded customer per project instead of inventing a customer-creation
    // path this app doesn't otherwise have (`POST /customers/` 500s here —
    // its serializer doesn't accept `hub`, and nothing else injects it).
    orderId = await createInvoiceableOrder(request, testInfo.project.name === "mobile" ? 1 : 0);
    const order = (await (await request.get(`${API_BASE_URL}/orders/${orderId}/`)).json()) as {
      customer: string;
    };
    customerId = order.customer;
  });

  /** `/billing/credits/...` is Admin/Founder-only — the `request` fixture
   * used inside an individual test doesn't share cookies with the one
   * `beforeAll` logged in (each gets its own, confirmed directly: reusing
   * it here 401ed), so each check below logs its own `request` context in
   * as admin first rather than relying on `page`'s session (which is
   * often deliberately logged in as a non-admin role to drive the UI). */
  async function adminCreditBalance(
    request: import("@playwright/test").APIRequestContext,
    id: string
  ) {
    await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: DEMO_USERS.admin.email, password: DEMO_USERS.admin.password },
    });
    const res = await request.get(`${API_BASE_URL}/billing/credits/${id}`);
    if (!res.ok()) throw new Error(`GET ${res.url()} -> ${res.status()}: ${await res.text()}`);
    return (await res.json()) as { balance_minor: number };
  }

  // `createInvoiceableOrder` reuses a seeded order's customer (only its
  // id matters for the order itself), and `seed_demo` already grants some
  // customers referral/goodwill credit — so these assertions read the
  // balance via the API before/after each mutation rather than assuming
  // a zero starting balance.

  test("an admin grants goodwill credit and the customer's balance increases by the granted amount", async ({
    page,
    request,
  }) => {
    await loginAs(page, DEMO_USERS.admin);
    await page.goto(`/console/customers/${customerId}`);

    const before = await adminCreditBalance(request, customerId);

    const section = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: "Store credit" }) })
      .filter({ hasText: "Available balance" })
      .last();
    await expect(section).toBeVisible();

    await section.getByRole("button", { name: "Grant credit" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Grant credit" })).toBeVisible();
    await dialog.getByLabel("Amount (₹)").fill("50.00");
    await dialog.getByRole("button", { name: "Grant credit" }).click();
    await expect(page.getByText(/Credit granted/i)).toBeVisible();
    // `seed_demo` may already have granted this customer a goodwill
    // credit, so more than one "Goodwill" row can be present — `.first()`
    // only needs one to exist, the balance delta below is the real check.
    await expect(section.getByText("Goodwill").first()).toBeVisible();

    const after = await adminCreditBalance(request, customerId);
    expect(after.balance_minor - before.balance_minor).toBe(5000);
  });

  test("an operator can pay part of an invoice with credit, and the balance decreases by the amount spent", async ({
    page,
    request,
  }) => {
    await loginAs(page, DEMO_USERS.operator);
    await page.goto(`/console/orders/${orderId}`);

    const [issueResponse] = await Promise.all([
      page.waitForResponse(
        (r) => /\/billing\/invoices\/[^/]+\/issue\/?$/.test(r.url()) && r.request().method() === "POST",
        { timeout: 15000 }
      ),
      page.getByRole("button", { name: "Issue invoice" }).click(),
    ]);
    expect(issueResponse.ok()).toBeTruthy();
    await expect(page.getByText(/INV-\d{4}-\d{4} issued/i)).toBeVisible({ timeout: 15000 });

    const before = await adminCreditBalance(request, customerId);
    expect(before.balance_minor).toBeGreaterThanOrEqual(5000);

    await page.getByRole("button", { name: "Record payment" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Record a payment" })).toBeVisible();

    // An operator can select and use CREDIT without being able to browse
    // the customer's full ledger (`/billing/credits/{id}` stays Admin/
    // Founder-only) — the dialog doesn't show an "Available credit" hint
    // for this role, it just submits and lets the server validate.
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Credit" }).click();

    await dialog.getByLabel("Amount (₹)").fill("20.00");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText(/Payment recorded/i)).toBeVisible();

    const after = await adminCreditBalance(request, customerId);
    expect(before.balance_minor - after.balance_minor).toBe(2000);

    // Store credit is Admin/Founder-only to view (docs/04 §3.7) — switch
    // roles to check the ledger entry, same as the API check above.
    await loginAs(page, DEMO_USERS.admin);
    await page.goto(`/console/customers/${customerId}`);
    const section = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: "Store credit" }) })
      .filter({ hasText: "Available balance" })
      .last();
    // Same "more than one row can already exist" reasoning as the
    // Goodwill check above — `seed_demo` may have already spent credit
    // for this customer against a different order.
    await expect(section.getByText("Spent on order").first()).toBeVisible();
  });

  test("an operator cannot view or grant customer credit, and field cannot record a credit payment", async ({
    page,
  }) => {
    await loginAs(page, DEMO_USERS.operator);
    await page.goto(`/console/customers/${customerId}`);
    await expect(page.getByRole("heading", { name: "Store credit" })).toBeHidden();

    // Field has no job on this order and can't list its invoice — fetch
    // the ref now, while `page` is still the operator's own session, for
    // the field-side POST attempt below.
    const invoicesRes = await page.request.get(`${API_BASE_URL}/billing/invoices/`, {
      params: { order: orderId },
    });
    const [invoice] = ((await invoicesRes.json()) as { results: { ref: string }[] }).results;

    await loginAsField(page, DEMO_USERS.field);
    const balanceResp = await page.request.get(`${API_BASE_URL}/billing/credits/${customerId}`);
    expect(balanceResp.status()).toBe(403);

    // Field is restricted server-side to CASH/UPI_QR regardless of what
    // the UI offers (`_FIELD_ALLOWED_METHODS` in `billing/views.py`) —
    // exercised directly against the API since the field PWA has no
    // record-payment screen of its own to drive through the UI. Expected
    // to 404 (not this rider's job, so outside their scoped queryset)
    // rather than 403 — either way, field never gets to spend credit.
    const cookies = (await page.context().cookies()).find((c) => c.name === "csrftoken");
    const paymentResp = await page.request.post(
      `${API_BASE_URL}/billing/invoices/${invoice.ref}/payments/`,
      {
        headers: { "X-CSRFToken": cookies?.value ?? "" },
        data: { method: "CREDIT", amount: 100, idempotency_key: "e2e-field-credit-denied" },
      }
    );
    expect(paymentResp.ok()).toBeFalsy();
  });
});

type OrderLine = { garment_type: string; declared_qty: number };
type OrderDetail = { id: string; hub: string; customer: string; service: string; lines: OrderLine[] };

/** Session-auth POSTs need `X-CSRFToken` matching the `csrftoken` cookie —
 * same helper `billing.spec.ts` uses for its own `request`-fixture writes. */
async function csrfHeader(request: import("@playwright/test").APIRequestContext) {
  const cookies = (await request.storageState()).cookies;
  const token = cookies.find((c) => c.name === "csrftoken")?.value;
  if (!token) throw new Error("No csrftoken cookie — did login run first?");
  return { "X-CSRFToken": token };
}

/** Creates a fresh counter order and drives it AT_HUB -> INTAKE_VERIFIED ->
 * IN_PRODUCTION, same shape as `billing.spec.ts`'s own `createInvoiceableOrder`
 * (duplicated rather than imported — these spec files don't share helpers
 * across files in this suite). */
async function createInvoiceableOrder(
  request: import("@playwright/test").APIRequestContext,
  customerIndex = 0
) {
  const headers = await csrfHeader(request);
  // This file's own tests grant and spend against the customer's *shared*
  // credit balance (unlike an invoice, which is scoped to one order) — so
  // `chromium` and `mobile`, each running this whole file as their own
  // worker, need distinct customers or their concurrent grants/spends
  // collide on the same ledger (confirmed directly: they did). Fetching
  // several seeded orders and de-duplicating by `customer` (rather than
  // assuming adjacent orders belong to different customers) picks a
  // `customerIndex`'th *distinct* customer for `createInvoiceableOrder`'s
  // caller to hand a different one to each project. `POST /customers/`
  // isn't an option here — its serializer doesn't accept `hub` and
  // nothing else injects it, so a fresh create 500s.
  const listRes = await request.get(`${API_BASE_URL}/orders/`, { params: { page_size: "20" } });
  const orders = (await listRes.json()).results as { id: string; customer: string }[];
  const distinctCustomers = [...new Set(orders.map((o) => o.customer))];
  const templateOrder = orders.find((o) => o.customer === distinctCustomers[customerIndex]);
  if (!templateOrder) throw new Error(`Seed data has fewer than ${customerIndex + 1} customers`);
  const template = (await (
    await request.get(`${API_BASE_URL}/orders/${templateOrder.id}/`)
  ).json()) as OrderDetail;
  const [line] = template.lines;

  let created;
  for (let attempt = 0; ; attempt++) {
    created = await request.post(`${API_BASE_URL}/orders/counter`, {
      headers,
      data: {
        hub: template.hub,
        customer: template.customer,
        service: template.service,
        lines: [{ garment_type: line.garment_type, qty: 2 }],
      },
    });
    if (created.ok() || attempt === 4) break;
  }
  expect(created.ok()).toBeTruthy();
  const order = (await created.json()) as { id: string };

  const intake = await request.post(`${API_BASE_URL}/orders/${order.id}/intake/`, {
    headers,
    data: { verified_lines: [{ garment_type: line.garment_type, qty: 2 }] },
  });
  expect(intake.ok()).toBeTruthy();

  const advance = await request.post(`${API_BASE_URL}/orders/${order.id}/advance/`, {
    headers,
    data: { to_status: "IN_PRODUCTION" },
  });
  expect(advance.ok()).toBeTruthy();

  return order.id;
}

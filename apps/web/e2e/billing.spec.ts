import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** Three orders this file owns outright, fixed once per project run
 * (`beforeAll`). Earlier versions picked orders out of the shared
 * IN_PRODUCTION/READY/OUT_FOR_DELIVERY pool — but that pool isn't stable
 * across a full CI run: `production`/`custody`/`fulfilment` specs move
 * orders through those exact statuses concurrently, and `chromium` and
 * `mobile` each snapshot it independently in their own `beforeAll`, so a
 * "front half"/"back half" split of two different snapshots is no
 * guarantee against both projects landing on the same order. Confirmed
 * this in CI directly: a run failed with the API's own rejection,
 * `"ORD-2609-0006 already has an invoice."`
 *
 * Creating fresh counter orders and driving them to IN_PRODUCTION here
 * removes the shared pool entirely — nothing else in the suite queries by
 * order status the way this file did, so nothing else can touch these. */
let orderIds: string[] = [];

test.describe("Billing", () => {
  // Keeps this file's own 3 tests from racing each other over their order
  // trio within one project.
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }) => {
    const login = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: DEMO_USERS.operator.email, password: DEMO_USERS.operator.password },
    });
    expect(login.ok()).toBeTruthy();

    orderIds = [
      await createInvoiceableOrder(request),
      await createInvoiceableOrder(request),
      await createInvoiceableOrder(request),
    ];
  });

  test("an operator can issue an invoice from the order detail page", async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);

    await page.goto(`/console/orders/${orderIds[0]}`);
    await expect(page.getByRole("heading", { name: "Invoice" })).toBeVisible();

    await clickIssueInvoiceAndWaitForResponse(page);
    // Unlike every other mutation in this suite, issuing renders a PDF
    // server-side (WeasyPrint) inside the same request — genuinely slower
    // than Playwright's default 5s assertion window under CI's real
    // concurrent load, not a sign anything is stuck.
    await expect(page.getByText(/INV-\d{4}-\d{4} issued/i)).toBeVisible({ timeout: 15000 });
  });

  test("issuing an invoice twice for the same order is rejected", async ({ page, request }) => {
    await loginAs(page, DEMO_USERS.operator);

    await page.goto(`/console/orders/${orderIds[1]}`);
    await clickIssueInvoiceAndWaitForResponse(page);
    const toastText = await page.getByText(/INV-\d{4}-\d{4} issued/i).textContent({ timeout: 15000 });

    // docs/06 §3.1's "View invoice" row is `✓` for Operator — once issued,
    // the "Issue invoice" button is replaced by the invoice summary
    // (`InvoiceSection` only renders it while no invoice is known yet), so
    // a second attempt is exercised directly against the API instead of a
    // UI button that's no longer there.
    await expect(page.getByRole("button", { name: "Issue invoice" })).toBeHidden();
    const ref = toastText?.match(/INV-\d{4}-\d{4}/)?.[0];
    // `exact: true` — the success toast (still visible) also contains the
    // ref as a substring ("INV-... issued"), and a plain match would hit
    // both it and the invoice summary's own ref span.
    await expect(page.getByText(ref!, { exact: true })).toBeVisible();

    // A fresh, separate `request` context — not the same cookie jar as
    // `page` — so it authenticates for itself before calling the API
    // directly, same as `createInvoiceableOrder`'s own login-then-act shape.
    const login = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: DEMO_USERS.operator.email, password: DEMO_USERS.operator.password },
    });
    expect(login.ok()).toBeTruthy();
    const headers = await csrfHeader(request);
    const secondIssue = await request.post(`${API_BASE_URL}/billing/invoices/${orderIds[1]}/issue`, {
      headers,
    });
    expect(secondIssue.ok()).toBeFalsy();
    expect(await secondIssue.text()).toContain("already has an invoice");
  });

  test("an operator can record a partial then a closing payment, and the invoice reaches PAID", async ({
    page,
  }) => {
    await loginAs(page, DEMO_USERS.operator);

    await page.goto(`/console/orders/${orderIds[2]}`);
    await clickIssueInvoiceAndWaitForResponse(page);
    const toastText = await page.getByText(/INV-\d{4}-\d{4} issued/i).textContent({ timeout: 15000 });
    const ref = toastText?.match(/INV-\d{4}-\d{4}/)?.[0];
    if (!ref) throw new Error(`Couldn't parse an invoice ref out of "${toastText}"`);
    // `exact: true` — the (still visible) success toast also contains this
    // as a substring ("INV-... issued"), same as the previous test.
    await expect(page.getByText(ref, { exact: true })).toBeVisible();

    // `page.request` shares the page's own session cookies (and its CSRF
    // cookie) — this is just the same GET `InvoiceSection` already made,
    // read directly to know the real total rather than parsing formatted
    // currency text back out of the DOM.
    const totalMinor = ((await (await page.request.get(`${API_BASE_URL}/billing/invoices/${ref}/`)).json()) as {
      total_minor: number;
    }).total_minor;
    const halfRupees = (Math.floor(totalMinor / 2) / 100).toFixed(2);

    await page.getByRole("button", { name: "Record payment" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Record a payment" })).toBeVisible();
    await dialog.getByLabel("Amount (₹)").fill(halfRupees);
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText(/Payment recorded/i)).toBeVisible();

    // Partial: the invoice itself stays ISSUED (only the order's aggregate
    // `payment_status` becomes PARTIALLY_PAID — docs/01 §5.2), so "Record
    // payment" stays available for the remainder. `exact: true` throughout
    // this test: a plain substring match would also hit the nearby "Issued
    // {date}" line, and (while the dialog's close animation is still
    // running) the dialog's own "Balance due: ₹…" helper text.
    await expect(page.getByText("issued", { exact: true })).toBeVisible();
    await expect(page.getByText("Balance due", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record payment" })).toBeVisible();

    const remainingMinor = totalMinor - Math.round(Number(halfRupees) * 100);
    const remainingRupees = (remainingMinor / 100).toFixed(2);

    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog.getByRole("heading", { name: "Record a payment" })).toBeVisible();
    await dialog.getByLabel("Amount (₹)").fill(remainingRupees);
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText(/Payment recorded/i)).toBeVisible();

    // Both this invoice's own badge *and* the order's separate payment-status
    // indicator read "paid" once fully settled — scoped to the row holding
    // this invoice's ref to check the right one rather than either match.
    const invoiceRow = page.locator("div", { has: page.getByText(ref, { exact: true }) }).last();
    await expect(invoiceRow.getByText("paid", { exact: true })).toBeVisible();
    await expect(page.getByText("Balance due", { exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Record payment" })).toBeHidden();
  });
});

/** Clicks "Issue invoice" and waits for its POST to resolve, failing loudly
 * with the response body if the API itself rejected it — a bare UI-text
 * timeout doesn't say whether that's a real rejection or a slow-but-fine
 * PDF render. */
async function clickIssueInvoiceAndWaitForResponse(page: import("@playwright/test").Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => /\/billing\/invoices\/[^/]+\/issue\/?$/.test(r.url()) && r.request().method() === "POST",
      { timeout: 15000 }
    ),
    page.getByRole("button", { name: "Issue invoice" }).click(),
  ]);
  if (!response.ok()) {
    throw new Error(`POST ${response.url()} -> ${response.status()}: ${await response.text()}`);
  }
}

type OrderLine = { garment_type: string; declared_qty: number };
type OrderDetail = { id: string; hub: string; customer: string; service: string; lines: OrderLine[] };

/** Session-auth POSTs need `X-CSRFToken` matching the `csrftoken` cookie
 * (set on login) — `lib/api/client.ts`'s `apiFetch` adds this for the
 * browser's own requests, but the `request` fixture is a separate,
 * unauthenticated-by-default context that has to do it by hand. */
async function csrfHeader(request: import("@playwright/test").APIRequestContext) {
  const cookies = (await request.storageState()).cookies;
  const token = cookies.find((c) => c.name === "csrftoken")?.value;
  if (!token) throw new Error("No csrftoken cookie — did login run first?");
  return { "X-CSRFToken": token };
}

/** Creates a fresh counter order, reusing an existing order's hub/service/
 * customer/garment-type (any seeded order works — only their ids matter),
 * then drives it AT_HUB -> INTAKE_VERIFIED -> IN_PRODUCTION via the same
 * intake/advance endpoints the console UI itself calls, so it lands in the
 * same invoiceable state `InvoiceSection` gates on without depending on
 * any order another test or project might also be looking at. */
async function createInvoiceableOrder(request: import("@playwright/test").APIRequestContext) {
  const headers = await csrfHeader(request);
  const listRes = await request.get(`${API_BASE_URL}/orders/`, { params: { page_size: "1" } });
  const [{ id: templateId }] = (await listRes.json()).results as { id: string }[];
  const template = (await (await request.get(`${API_BASE_URL}/orders/${templateId}/`)).json()) as OrderDetail;
  const [line] = template.lines;

  // `chromium` and `mobile` create their own orders concurrently — Order.ref
  // is generated from a plain count() with no locking (same class of bug
  // already fixed for Invoice.ref in billing/services.py, but this one's in
  // ordering, outside this PR), so two counter orders landing at once can
  // collide and 500. Confirmed directly: running both projects together
  // reproduced "duplicate key value violates unique constraint
  // ordering_order_ref_key". Retrying is the right fix here, not touching
  // ordering's ref generation for an unrelated PR.
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

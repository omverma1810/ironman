import { test, expect, loginAs, loginAsField, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** `seed_demo`'s own `_seed_cash_custody` guarantees the field account has
 * a real, substantial CASH balance (docs/08 batch 3.3) — no fresh
 * invoice/payment setup needed here. Recording a *new* CASH payment as
 * field would need an order with a fulfilment job assigned to them
 * (`InvoiceViewSet.get_queryset`'s own field-scoping keys off
 * `order__jobs__assigned_to`), which is fulfilment-batch plumbing this
 * cash-custody batch doesn't otherwise touch — the seeded balance already
 * gives this file everything the handover flow needs.
 *
 * The declared handover amount is a small, Date.now()-derived value (same
 * "make it collide-proof, not exactly unique" fix `apartments.spec.ts`
 * already uses for the same "two Playwright projects run this file
 * concurrently" reason) — comfortably below the seeded balance, and small
 * enough (well under ₹1,000) that its ₹-formatted text never picks up
 * `en-IN`'s thousands-separator, which the row-text matches below rely on. */
const declaredMinor = 100 + (Date.now() % 300); // ₹1.00–₹3.99
const declaredRupees = (declaredMinor / 100).toFixed(2);

test.describe("Cash custody", () => {
  test.describe.configure({ mode: "serial" });

  test("a field rider can hand over cash to the hub", async ({ page }) => {
    await loginAsField(page, DEMO_USERS.field);
    await page.getByRole("link", { name: "Cash" }).click();
    await page.waitForURL("**/field/cash");

    await expect(page.getByText("Cash in hand")).toBeVisible();

    await page.getByRole("button", { name: "Hand over cash" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Hand over cash" })).toBeVisible();

    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Suman Naik", exact: true }).click();
    await dialog.getByLabel("Amount (₹)").fill(declaredRupees);
    await dialog.getByRole("button", { name: "Hand over" }).click();

    await expect(page.getByText("Handover initiated")).toBeVisible();
    // The narrowest element containing both texts is the card's own outer
    // div — the amount and the "Pending" badge are siblings under it, not
    // nested, so no smaller div contains both (same "narrow by two `hasText`
    // filters" idiom `billing.spec.ts`'s own `invoiceRow` uses with `.last()`
    // to land on the innermost match).
    const card = page
      .locator("div")
      .filter({ hasText: `₹${declaredRupees}` })
      .filter({ hasText: "Pending" })
      .last();
    await expect(card.getByText("Suman Naik")).toBeVisible();
  });

  test("an operator can confirm the handover with a variance, and a founder sees it reconciled", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only: asserts the <table> structure directly");

    await loginAs(page, DEMO_USERS.operator);
    await page.goto("/console/cash-reconciliation");
    await expect(page.getByRole("heading", { name: "Pending handovers" })).toBeVisible();

    const pendingRow = page.locator("tr", { hasText: "Vikram Singh" }).filter({ hasText: `₹${declaredRupees}` });
    await expect(pendingRow).toBeVisible();

    // A deliberate shortfall — exercises the variance path
    // `services.confirm_handover` records either way.
    const receivedRupees = (declaredMinor / 100 - 0.5).toFixed(2);
    await pendingRow.getByRole("button", { name: "Confirm" }).click();
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog.getByRole("heading", { name: "Confirm handover" })).toBeVisible();
    await confirmDialog.getByLabel("Amount actually received (₹)").fill(receivedRupees);
    await expect(confirmDialog.getByText(/Short by/)).toBeVisible();
    await confirmDialog.getByLabel("Note (optional)").fill("E2E short handover");
    await confirmDialog.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByText("Handover confirmed")).toBeVisible();
    await expect(pendingRow).toBeHidden();

    // Admin/Founder-only reconciliation report — a fresh login, not just a
    // role switch, since the console session itself is per-user.
    await loginAs(page, DEMO_USERS.founder);
    await page.goto("/console/cash-reconciliation");
    await expect(page.getByRole("heading", { name: "Reconciliation" })).toBeVisible();

    // `seed_demo` already confirms one handover for the same rider on the
    // same (IST) calendar day this suite runs on — the row's variance is
    // an aggregate of that plus this test's own shortfall, not this test's
    // -₹0.50 alone. Read the real aggregate back from the same endpoint
    // the page itself calls (no `date` param — same "today, IST" default
    // `CashReconciliationView` falls back to) rather than assume a total.
    const reconciliation = (await (
      await page.request.get(`${API_BASE_URL}/billing/cash/reconciliation`)
    ).json()) as { rider_name: string; variance_minor: number }[];
    const riderRow = reconciliation.find((r) => r.rider_name === "Vikram Singh");
    expect(riderRow).toBeTruthy();
    expect(riderRow!.variance_minor).toBeLessThan(0);
    const varianceRupees = (Math.abs(riderRow!.variance_minor) / 100).toFixed(2);

    // Scoped to the Reconciliation section specifically — a founder also
    // sees the Pending Handovers table above it (any ops staff's own
    // section, docs/06 §3.1), which can have its own "Vikram Singh" rows
    // for any handover not yet confirmed (mobile's own, skipped above, or
    // a leftover seeded one) and would otherwise collide with a bare `tr`
    // lookup across the whole page.
    const reconciliationSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Reconciliation" }) });
    const reconciliationRow = reconciliationSection.locator("tr", { hasText: "Vikram Singh" });
    await expect(reconciliationRow).toBeVisible();
    await expect(reconciliationRow.getByText(/Short/)).toBeVisible();
    await expect(reconciliationRow.getByText(`₹${varianceRupees}`, { exact: true })).toBeVisible();
  });

  test("an operator can record a bank deposit", async ({ page }) => {
    await loginAs(page, DEMO_USERS.operator);
    await page.goto("/console/cash-reconciliation");

    await page.getByRole("button", { name: "Record deposit" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Record a bank deposit" })).toBeVisible();
    await dialog.getByLabel("Amount (₹)").fill("0.50");
    await dialog.getByLabel("Bank reference (optional)").fill(`E2E-${Date.now()}`);
    await dialog.getByRole("button", { name: "Record deposit" }).click();

    await expect(page.getByText("Deposit recorded")).toBeVisible();
  });
});

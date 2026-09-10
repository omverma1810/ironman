import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

test.describe("Pricing (batch 3.7)", () => {
  test("a founder can create a draft price list and price a garment type", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop-only: asserts the <table> row structure directly");
    await loginAs(page, DEMO_USERS.founder);
    await page.goto("/console/pricing");
    await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();

    await page.getByRole("button", { name: "New price list" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "New price list" })).toBeVisible();

    // Hub and service both default-select to the only/first seeded option
    // (this dialog's own effect) — Ironing is that service, so nothing
    // needs picking here.
    await dialog.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByText(/draft price list created/i)).toBeVisible();
    await expect(dialog.getByText(/draft/)).toBeVisible();

    // Reprices "Shirt" on this new DRAFT version only — the shared ACTIVE
    // price list every other concurrently-running spec's quote() reads
    // stays untouched until someone activates this draft, which this test
    // deliberately never does (see below).
    await dialog.getByLabel("Shirt").fill("99.00");
    await dialog.getByRole("button", { name: "Save prices" }).click();
    await expect(page.getByText(/price lines saved/i)).toBeVisible();

    // Not activated: activating would supersede the shared active price
    // list (docs/08 3.4/3.6/3.7 specs and others all quote against it
    // concurrently) — confirmed directly, doing so here broke them. The
    // activate transition itself is already covered end-to-end by
    // `catalog/tests/test_rbac.py::test_founder_can_create_and_activate_a_price_list`.
    await expect(dialog.getByRole("button", { name: "Activate" })).toBeEnabled();
    // Not `dialog.getByRole("button", { name: "Close" })` — that also
    // matches the dialog's own built-in "X" close-icon button, which
    // shares the same accessible name.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // `.first()` — a retry or a repeated local run can leave more than one
    // draft version behind; this only needs to confirm ours landed.
    const row = page.locator("tr", { hasText: "Ironing" }).filter({ hasText: "draft" }).first();
    await expect(row).toBeVisible();
  });

  test("a founder can create an offer and toggle it inactive", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop-only: asserts the <table> row structure directly");
    await loginAs(page, DEMO_USERS.founder);
    await page.goto("/console/pricing");
    await page.getByRole("tab", { name: "Offers" }).click();

    const code = `WELCOME${Date.now() % 100000}`;
    await page.getByRole("button", { name: "New offer" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "New offer" })).toBeVisible();
    await dialog.getByLabel("Code").fill(code);
    await dialog.getByLabel("Discount (%)").fill("15");
    // Already-expired window — a live PERCENT offer with no apartment
    // scope auto-applies to *every* order's quote() (`catalog.services.
    // quote`'s own docstring), so an open-ended one here would silently
    // discount every other concurrently-running spec's order totals
    // (confirmed directly: it did). Expired means `is_valid_now()` always
    // skips it, so this only exercises the create/list/toggle UI, not the
    // shared quote engine.
    await dialog.getByLabel("Effective from").fill("2020-01-01");
    await dialog.getByLabel("Effective to (optional)").fill("2020-01-02");
    await dialog.getByRole("button", { name: "Create offer" }).click();
    await expect(page.getByText(new RegExp(`Offer "${code}" created`))).toBeVisible();

    const row = page.locator("tr", { hasText: code });
    await expect(row.getByText("Active", { exact: true })).toBeVisible();

    await row.getByText("Active", { exact: true }).click();
    await expect(page.getByText(/offer updated/i)).toBeVisible();
    await expect(row.getByText("Inactive", { exact: true })).toBeVisible();
  });

  test("an operator sees a founder-only restricted state, not the pricing tools", async ({
    page,
  }) => {
    await loginAs(page, DEMO_USERS.operator);
    await page.goto("/console/pricing");
    await expect(page.getByText(/founder-only/i)).toBeVisible();
    await expect(page.getByRole("tab", { name: "Price lists" })).toBeHidden();
    await expect(page.getByRole("button", { name: "New offer" })).toBeHidden();
  });
});

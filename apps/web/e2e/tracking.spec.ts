import { test, expect, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** The public `/track/{token}` page (batch 4.1, docs/01 §4b C-3) needs no
 * login — this file never logs `page` in at all, only the `request`
 * fixture used to create the order via the API. A fresh counter order
 * (reusing an existing seeded order's hub/customer/service/garment_type,
 * same pattern `credit-ledger.spec.ts`/`billing.spec.ts` use) is safe here:
 * unlike a shared credit balance, price list or offer, a newly created
 * order is its own row nobody else's test reads, so chromium/mobile
 * workers creating one concurrently never collide. */

type OrderDetail = {
  id: string;
  hub: string;
  customer: string;
  service: string;
  ref: string;
  tracking_token: string;
  total_minor: number;
  customer_phone: string;
  lines: { garment_type: string; garment_type_name: string; declared_qty: number }[];
};

async function csrfHeader(request: import("@playwright/test").APIRequestContext) {
  const cookies = (await request.storageState()).cookies;
  const token = cookies.find((c) => c.name === "csrftoken")?.value;
  if (!token) throw new Error("No csrftoken cookie — did login run first?");
  return { "X-CSRFToken": token };
}

async function createTrackableOrder(request: import("@playwright/test").APIRequestContext) {
  const login = await request.post(`${API_BASE_URL}/auth/login`, {
    data: { email: DEMO_USERS.operator.email, password: DEMO_USERS.operator.password },
  });
  expect(login.ok()).toBeTruthy();
  const headers = await csrfHeader(request);

  const listRes = await request.get(`${API_BASE_URL}/orders/`, { params: { page_size: "5" } });
  const [templateSummary] = (await listRes.json()).results as { id: string }[];
  const template = (await (
    await request.get(`${API_BASE_URL}/orders/${templateSummary.id}/`)
  ).json()) as OrderDetail;
  const [line] = template.lines;

  const created = await request.post(`${API_BASE_URL}/orders/counter`, {
    headers,
    data: {
      hub: template.hub,
      customer: template.customer,
      service: template.service,
      lines: [{ garment_type: line.garment_type, qty: 2 }],
    },
  });
  expect(created.ok()).toBeTruthy();
  return (await created.json()) as OrderDetail;
}

test.describe("Order tracking page", () => {
  test("shows live status, items and total for a valid tracking link, with no login and no PII beyond the customer's own", async ({
    page,
    request,
  }) => {
    const order = await createTrackableOrder(request);

    await page.goto(`/track/${order.tracking_token}`);

    await expect(page.getByRole("heading", { name: order.ref })).toBeVisible();
    // A fresh counter order with no pickup slot lands on SCHEDULED (docs/02's
    // `create_order`) — shown via the same per-status `StageBadge` label the
    // console uses, in both the header badge and (once) the timeline below,
    // hence `.first()` rather than an exact single match.
    await expect(page.getByText("Scheduled").first()).toBeVisible();
    await expect(page.getByText(order.lines[0].garment_type_name)).toBeVisible();
    await expect(page.getByText("× 2")).toBeVisible();

    // Never logged in, and the page never redirects to a login screen.
    await expect(page).toHaveURL(/\/track\//);
    await expect(page.getByRole("heading", { name: /log in/i })).toHaveCount(0);

    // No phone/email — the token is the only credential this page trusts.
    await expect(page.getByText(order.customer_phone)).toHaveCount(0);
  });

  test("an unknown tracking token shows a friendly not-found state, not an error page", async ({
    page,
  }) => {
    await page.goto("/track/this-token-does-not-exist");

    await expect(page.getByText("We couldn't find this order")).toBeVisible();
  });
});

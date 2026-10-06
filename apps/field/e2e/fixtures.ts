import { expect, request as playwrightRequest, type APIRequestContext, type Page } from "@playwright/test";

export const API = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
const PASSWORD = "IronMan@2026";
export const RIDER = { email: "field@ironman.test", password: PASSWORD };

/** Today in India: what the app calls "today", and the route day jobs go on. */
export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** A back-office session: cookie login plus the CSRF header its POSTs need. */
async function office(email: string) {
  const ctx = await playwrightRequest.newContext();
  const login = await ctx.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const csrf = (await ctx.storageState()).cookies.find((c) => c.name === "csrftoken")?.value ?? "";
  const headers = { "X-CSRFToken": csrf, Referer: "http://localhost:8000/" };
  return {
    get: async <T>(path: string, params?: Record<string, string>) => {
      const res = await ctx.get(`${API}${path}`, { params });
      expect(res.ok(), `${path}: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    },
    post: async <T>(path: string, data: unknown) => {
      const res = await ctx.post(`${API}${path}`, { data, headers });
      expect(res.ok(), `${path}: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    },
    dispose: () => ctx.dispose(),
  };
}

type RouteDay = { id: string; jobs: { id: string; order: string }[] };

async function assign(
  founder: Awaited<ReturnType<typeof office>>,
  orderId: string,
  kind: "PICKUP" | "DELIVERY"
): Promise<string> {
  const staff = await founder.get<{ results?: { id: string; email: string }[] } | { id: string; email: string }[]>(
    "/identity/staff"
  );
  const list = Array.isArray(staff) ? staff : (staff.results ?? []);
  const rider = list.find((s) => s.email === RIDER.email);
  if (!rider) throw new Error("The demo rider isn't in the staff list");
  const serviceability = await founder.get<{ clusters: { id: string }[] }>("/territory/serviceability", {
    pincode: "500027",
  });
  const day = await founder.post<RouteDay>("/fulfilment/route-days/", {
    cluster: serviceability.clusters[0].id,
    date: todayInIndia(),
  });
  const assigned = await founder.post<RouteDay>(`/fulfilment/route-days/${day.id}/assign/`, {
    staff: [rider.id],
    jobs: [{ order_id: orderId, kind, assigned_to: rider.id }],
  });
  const job = assigned.jobs.find((j) => j.order === orderId);
  if (!job) throw new Error("The job wasn't created");
  return job.id;
}

let counter = 0;
function newPhone(): string {
  counter += 1;
  return `9${`${Date.now() % 10_000_000}${counter}`.padStart(9, "0").slice(-9)}`;
}

/** A customer books two shirts for Sai Krupa Residency, as the app would, and
 * ops give the pickup to the demo rider for today. Returns the job and order. */
export async function seedPickup(): Promise<{ jobId: string; orderRef: string }> {
  const phone = `+91${newPhone()}`;
  const ctx = await playwrightRequest.newContext();
  try {
    await ctx.post(`${API}/auth/otp/request`, { data: { phone, purpose: "LOGIN" } });
    const { code } = await (await ctx.get(`${API}/auth/otp/debug`, { params: { phone } })).json();
    const { access } = await (await ctx.post(`${API}/auth/otp/verify`, { data: { phone, code } })).json();
    const auth = { Authorization: `Bearer ${access}` };

    const serviceability = await (await ctx.get(`${API}/territory/serviceability`, { params: { pincode: "500027" } })).json();
    const apartments = await (await ctx.get(`${API}/territory/apartments`, { params: { q: "Sai Krupa" } })).json();
    const services = await (await ctx.get(`${API}/catalog/services/`, { headers: auth })).json();
    const service = services.results.find((s: { is_active: boolean }) => s.is_active);
    const garments = await (
      await ctx.get(`${API}/catalog/garment-types/`, { headers: auth, params: { service: service.id, limit: "100" } })
    ).json();
    const placed = await ctx.post(`${API}/orders/`, {
      headers: { ...auth, "Idempotency-Key": `field-e2e-${phone}` },
      data: {
        hub: serviceability.hub.id,
        service: service.id,
        channel: "APP",
        apartment: apartments[0].id,
        flat_no: "402",
        lines: [{ garment_type: garments.results[0].id, qty: 2 }],
      },
    });
    expect(placed.ok(), await placed.text()).toBeTruthy();
    const order = (await placed.json()) as { id: string; ref: string };

    const founder = await office("founder@ironman.test");
    try {
      return { jobId: await assign(founder, order.id, "PICKUP"), orderRef: order.ref };
    } finally {
      await founder.dispose();
    }
  } finally {
    await ctx.dispose();
  }
}

/** A ready order with one bag, handed to the demo rider as today's delivery. */
export async function seedDelivery(): Promise<{ jobId: string; orderRef: string; bagCode: string }> {
  const founder = await office("founder@ironman.test");
  try {
    const list = await founder.get<{ results: { id: string }[] }>("/orders/", { page_size: "1" });
    const template = await founder.get<{
      hub: string;
      customer: string;
      service: string;
      lines: { garment_type: string }[];
    }>(`/orders/${list.results[0].id}/`);
    const garment = template.lines[0].garment_type;
    const order = await founder.post<{ id: string; ref: string }>("/orders/counter", {
      hub: template.hub,
      customer: template.customer,
      service: template.service,
      lines: [{ garment_type: garment, qty: 2 }],
    });
    await founder.post(`/orders/${order.id}/intake/`, { verified_lines: [{ garment_type: garment, qty: 2 }] });
    await founder.post(`/orders/${order.id}/advance/`, { to_status: "IN_PRODUCTION" });
    await founder.post(`/orders/${order.id}/advance/`, { to_status: "READY" });
    const bag = await founder.post<{ code: string }>(`/orders/${order.id}/bags`, {});
    return { jobId: await assign(founder, order.id, "DELIVERY"), orderRef: order.ref, bagCode: bag.code };
  } finally {
    await founder.dispose();
  }
}

/** What the server has for a job, as the back office sees it. */
export async function serverStatus(jobId: string): Promise<string> {
  const founder = await office("founder@ironman.test");
  try {
    return (await founder.get<{ status: string }>(`/fulfilment/jobs/${jobId}/`)).status;
  } finally {
    await founder.dispose();
  }
}

export async function signInAsRider(page: Page, credentials = RIDER) {
  await page.goto("/");
  await page.getByTestId("email-input").fill(credentials.email);
  await page.getByTestId("password-input").fill(credentials.password);
  await page.getByTestId("sign-in").click();
}

export async function openJob(page: Page, orderRef: string) {
  const row = page.getByTestId(`job-${orderRef}`);
  await expect(row).toBeVisible();
  await row.click();
}

export type { APIRequestContext };

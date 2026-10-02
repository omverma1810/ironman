import { test, expect, loginAs, DEMO_USERS } from "./fixtures";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

test("a customer's page shows where they came from; field staff can't read attributions", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop-only");
  await loginAs(page, DEMO_USERS.operator);

  // Every seeded customer who has ordered has a first-touch row, written by
  // the same capture path real bookings use.
  const res = await page.request.get(`${API_BASE_URL}/growth/attributions/`, {
    params: { is_first_touch: "true" },
  });
  expect(res.ok()).toBeTruthy();
  const [first] = ((await res.json()) as { results: { customer: string; channel_name: string }[] })
    .results;
  expect(first).toBeTruthy();

  await page.goto(`/console/customers/${first.customer}`);
  await expect(page.getByTestId("acquired-via")).toContainText(`Acquired via ${first.channel_name}`);
});

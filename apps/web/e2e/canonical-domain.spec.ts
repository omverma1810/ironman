import { test, expect } from "./fixtures";

// Vercel's own production address serves the same app, but the API only
// trusts the real domains, so logging in there failed with a bare 400.
// It now redirects to the real domain, keeping the path.
const VERCEL_HOST = { host: "ironman-console.vercel.app" };

for (const [path, target] of [
  ["/console/login", "https://console.ironmanindia.co/console/login"],
  ["/field/login", "https://console.ironmanindia.co/field/login"],
  ["/book?ref=ABC", "https://ironmanindia.co/book?ref=ABC"],
] as const) {
  test(`vercel.app ${path} redirects to the real domain`, async ({ request }) => {
    const res = await request.get(path, { headers: VERCEL_HOST, maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe(target);
  });
}

test("the real domains are not redirected", async ({ request }) => {
  const res = await request.get("/login", {
    headers: { host: "console.ironmanindia.co" },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(200);
});

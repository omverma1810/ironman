import { test, expect } from "./fixtures";

// docs/08 batch 7.4 — every page ships the browser hardening headers.
for (const path of ["/", "/account", "/console/login", "/privacy"]) {
  test(`${path} sends security headers`, async ({ request }) => {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("microphone=()");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
}

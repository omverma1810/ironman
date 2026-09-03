import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DRF's DefaultRouter requires the trailing slash on every collection
  // endpoint (/api/v1/orders/, not /orders) — Next's own trailing-slash
  // normalization runs *before* rewrites and would 308 that off before the
  // proxy below ever saw it, sending the follow-up straight to the API's
  // real cross-site origin and defeating the whole rewrite. Confirmed by
  // hand: without this, GET /api/v1/orders/ 308-loops between Next
  // stripping the slash and Django's APPEND_SLASH re-adding it.
  skipTrailingSlashRedirect: true,
  // Console (Vercel) and API (Cloud Run) live on different registrable
  // domains, so every browser request is cross-site — a SameSite=None
  // session/CSRF cookie there is exactly the class of cookie mobile Safari
  // (and increasingly other browsers) can drop unreliably right after it's
  // set, which reads as "logged in, but the very next request 401s". This
  // rewrite makes the browser talk to its own origin only; Vercel forwards
  // the request to the real API server-side, so the cookie the browser
  // actually sees is an ordinary same-site one. lib/api/client.ts's
  // `apiFetch` switches to the relative `/api/v1` path whenever this same
  // env var is set, which is what routes traffic through this proxy.
  //
  // No-ops (empty rewrite) when the var isn't set — local dev, which
  // already talks directly to `http://localhost:8000` (same-site, no
  // proxy needed), is unaffected.
  async rewrites() {
    const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!apiOrigin) return [];
    // Two rules, not one: a `:path*` catch-all's *captured value* never
    // includes the request's own trailing slash, so a single
    // `${apiOrigin}/:path*` destination silently drops it — confirmed by
    // hand (GET /api/v1/orders/ reached Django as /api/v1/orders, which
    // 301-redirected back to the slash version, which hit this same
    // rewrite again: an infinite loop). Matching the trailing slash
    // *literally* in both source and destination, in its own rule, forces
    // it through regardless of what :path* captured.
    return [
      { source: "/api/v1/:path*/", destination: `${apiOrigin}/:path*/` },
      { source: "/api/v1/:path*", destination: `${apiOrigin}/:path*` },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Not used yet — the landing page ships with hand-drawn SVG illustration
  // instead of hotlinked stock photography (this sandbox's network policy
  // blocks images.unsplash.com outright, so no photo URL here could be
  // verified before shipping). Left configured so swapping in real photos
  // later is a one-line change, not a new deploy step.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  // DRF's DefaultRouter requires the trailing slash on every collection
  // endpoint (/api/v1/orders/, not /orders) — Next's own trailing-slash
  // normalization runs *before* rewrites and would 308 that off before the
  // proxy below ever saw it, sending the follow-up straight to the API's
  // real cross-site origin and defeating the whole rewrite. Confirmed by
  // hand: without this, GET /api/v1/orders/ 308-loops between Next
  // stripping the slash and Django's APPEND_SLASH re-adding it.
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  // docs/06 §4 (Phase 7.4): browser hardening for every page. The proxied
  // /api/v1 responses are left alone; Django sets the same headers on them
  // itself (config/settings/prod.py). No Content-Security-Policy yet: Next's
  // inline bootstrap scripts need nonces wired through middleware first,
  // and a CSP that has to allow 'unsafe-inline' protects little.
  async headers() {
    return [
      {
        source: "/((?!api/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          // Camera for proof photos and bag scans in the field app; location
          // only for the optional geotag on a proof (docs/06 §5). Nothing else.
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
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
    // A `:path*` catch-all's *captured value* never includes the
    // request's own trailing slash, so a plain `${apiOrigin}/:path*`
    // destination silently drops it (confirmed by hand: GET
    // /api/v1/orders/ reached Django as /api/v1/orders, which
    // 301-redirected back to the slash version, which hit this same
    // rewrite again — an infinite loop).
    //
    // A prior version of this file tried to fix that with a *second*
    // rule matching the trailing slash literally, checked first. That
    // made it worse: Next's route matcher treats a trailing slash in a
    // *pattern* as optional, not required, so that rule also matched
    // requests with no trailing slash at all — forcing one onto the
    // destination for every non-slash endpoint (healthz, me, every
    // auth/* route) and 404ing them against Django, which never
    // registered a slash-terminated version. Verified live: this class
    // of endpoint 404'd through the proxy in production while the
    // trailing-slash ones (docs/, schema/) worked, which is exactly
    // backwards from "broken" reading as a clean failure.
    //
    // `:path(.*)` is a *named* param with an explicit custom regex
    // instead of the repeating `:path*` segment matcher — `.*` matches
    // the raw remaining string, slashes included, as one piece rather
    // than splitting it into path segments and losing whether the last
    // one had a trailing slash. One rule, no ambiguity to mismatch on.
    return [{ source: "/api/v1/:path(.*)", destination: `${apiOrigin}/:path` }];
  },
};

export default nextConfig;

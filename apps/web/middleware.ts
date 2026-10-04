import { NextResponse, type NextRequest } from "next/server";

/** console.ironmanindia.co is the same Next.js deployment as the public
 * landing page (ironmanindia.co) — one Vercel project, two domains
 * pointed at it. Rather than a separate deploy, visitors on the console
 * subdomain get every path transparently rewritten under /console, so
 * console.ironmanindia.co/orders serves what /console/orders already
 * does at the root domain. /api, /_next and static files are left alone
 * so the existing API proxy rewrite (next.config.ts) and Next's own
 * assets keep working unchanged on either host. The field app (/field) is
 * passed through too, so riders can use the same console address. */
const CONSOLE_HOST = "console.ironmanindia.co";
const PUBLIC_HOST = "ironmanindia.co";

/** Vercel's own address for the production deployment. It serves the same
 * app, but the API only trusts the real domains (its allowed hosts and
 * CSRF origins come from CORS_ALLOWED_ORIGINS), so a login there failed
 * with a bare "Bad Request (400)" whatever the credentials. Send visitors
 * to the real domain instead of half-working on this one. */
const VERCEL_PRODUCTION_HOST = "ironman-console.vercel.app";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (host === VERCEL_PRODUCTION_HOST) return toCanonicalDomain(request);
  if (host !== CONSOLE_HOST) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/console") ||
    // The riders' app lives at /field on either host — rewriting it under
    // /console sent console.ironmanindia.co/field to a 404.
    pathname === "/field" ||
    pathname.startsWith("/field/") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/console${pathname}`;
  return NextResponse.rewrite(url);
}

function toCanonicalDomain(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // API calls follow the page: once the page is on the real domain, its
  // requests are too. Redirecting a POST here would only trade one failure
  // for a cross-origin one.
  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }
  const staff =
    pathname.startsWith("/console") || pathname === "/field" || pathname.startsWith("/field/");
  const target = new URL(`${pathname}${search}`, `https://${staff ? CONSOLE_HOST : PUBLIC_HOST}`);
  return NextResponse.redirect(target, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

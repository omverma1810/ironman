import { NextResponse, type NextRequest } from "next/server";

/** console.ironmanindia.co is the same Next.js deployment as the public
 * landing page (ironmanindia.co) — one Vercel project, two domains
 * pointed at it. Rather than a separate deploy, visitors on the console
 * subdomain get every path transparently rewritten under /console, so
 * console.ironmanindia.co/orders serves what /console/orders already
 * does at the root domain. /api, /_next and static files are left alone
 * so the existing API proxy rewrite (next.config.ts) and Next's own
 * assets keep working unchanged on either host. */
const CONSOLE_HOST = "console.ironmanindia.co";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (host !== CONSOLE_HOST) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/console") ||
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

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

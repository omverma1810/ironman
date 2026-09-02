# IronMan Web

Next.js 15 (App Router) + TypeScript + Tailwind v4. One app, three route
groups per `docs/05-frontend-architecture.md` §1:

| Route | Surface | Status |
|---|---|---|
| `/` | Public landing | Placeholder — the real booking flow is Phase 4 |
| `/console/*` | Ops console (admin/operator/founder) | **Built this phase**: auth, dashboard, orders, customers |
| `/field/*` | Field staff PWA | Not started — Phase 2 continuation |

## What's wired up

- **Auth**: staff email+password session login (`/console/login`), with
  the mandatory-TOTP-for-ADMIN/FOUNDER flow surfaced correctly, password
  reset request flow, logout, and a route-group auth gate that redirects
  unauthenticated visitors.
- **Orders**: list with URL-persisted filters (status/channel/search),
  detail page with items/timeline/re-quote handling/cancel, and a full
  counter-order creation flow with a live price quote.
- **Customers**: list with search, detail page with addresses and notes.
- **Design system**: brand tokens as Tailwind v4 `@theme` values (no
  arbitrary Tailwind values — enforced by `eslint-plugin-tailwindcss`),
  light/dark themes, an SVG icon system (Lucide + custom IronMan glyphs),
  and the five required UI states (loading/empty/error/permission-denied/
  offline) via the shared `AsyncBoundary` pattern.
- **Responsive**: every list view has a genuine mobile card fallback
  (`DataTable`), not a horizontally-scrolled table.

Routes for Phase 2+ nav destinations (Apartments, Exceptions, Pricing,
Analytics, Staff) render an honest "coming soon, here's the phase" state
rather than a dead link or a fake empty screen — see
`components/patterns/coming-soon.tsx`.

## Local setup

```bash
npm install          # from the repo root — this is an npm workspace
cp apps/web/.env.example apps/web/.env.local
npm run dev --workspace=apps/web
```

Requires the Django API running at `NEXT_PUBLIC_API_BASE_URL` (see
`apps/api/README.md`), seeded with `python manage.py seed_demo` for
anything to render.

## Quality gates

```bash
npx eslint apps/web --max-warnings=0
npx tsc --noEmit -p apps/web
npm run build --workspace=apps/web
npm run test:e2e --workspace=apps/web    # Playwright — needs both dev servers running
```

## Fonts

Self-hosted via `@fontsource` (Inter, Inter Tight, IBM Plex Mono) rather
than `next/font/google` — installed as npm packages so the build never
depends on reaching Google's font CDN. Functionally equivalent
(self-hosted woff2, `font-display: swap`) to what `next/font/google`
would produce.

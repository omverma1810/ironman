# 05 — Frontend Architecture

## 1. One codebase, three surfaces

```
apps/web/  (Next.js 15, App Router, TypeScript)
  app/
    (shop)/                    S1 — customer.  Public. SSR/RSC. SEO + speed matter.
      page.tsx                   landing
      book/                      booking wizard
      track/[token]/             tokenised tracking — THE main customer surface
      invoice/[ref]/
      account/                   phone-OTP login, orders, addresses, referrals
    console/                   S2 — ops / operator / founder.  Auth-gated. Client-rendered.
      orders/ intake/ board/ routes/ customers/ apartments/ staff/
      billing/ cash/ supplies/ growth/ analytics/ settings/ audit/
    field/                     S3 — field staff PWA.  Auth-gated. Mobile-first. Offline-capable.
      today/ job/[id]/ scan/ cash/
    (legal)/ privacy/ terms/
    not-found.tsx  error.tsx  offline/page.tsx
  components/{ui,patterns,charts,icons}
  lib/{api,auth,offline,format,permissions,analytics}
packages/
  tokens/        design tokens → CSS vars (web) + JS objects (native)
  api-client/    generated from OpenAPI, shared by web and mobile
```

**Why one Next.js app rather than three, or two.** A single app means one design system, one
auth client, one deploy pipeline and one set of state conventions. The cost is that an internal
console is being served by a framework built for public pages — which is why the console is
**client-rendered inside the App Router** (`"use client"` shells + TanStack Query) rather than
fighting RSC for auth-scoped, highly interactive tables. The public shop routes get the full
RSC/SSR treatment where SEO and first-paint genuinely pay. ADR-002 records the alternatives.

**Why the field surface is web first.** `01 §4(a)`. Riders need phones on pilot day one; a PWA
ships without an app store. The Expo app in Phase 9 adds offline-by-default, camera scanning and
push — an upgrade, not a prerequisite.

## 2. Design system

### 2.1 Brand and the contrast problem

IronMan is black + yellow. Stated plainly because it will otherwise be got wrong:
**IronMan Yellow on white fails WCAG contrast for text.** `#F5C518` on `#FFFFFF` is ≈1.9:1
against a 4.5:1 requirement. The rule for this brand:

> **Yellow is a surface and an accent, never body text on light. Text on yellow is near-black.
> On dark surfaces, yellow may be text.**

Primary buttons are therefore yellow with near-black labels — which is also the strongest,
most recognisable form of the brand.

### 2.2 Tokens — `packages/tokens`

Single source of truth. Emitted as CSS custom properties for web and as a typed JS object for
React Native. This is the *only* thing genuinely shared between web and mobile (`00 §5 T-1`).

```ts
color: {
  brand:   { yellow: '#F5C518', yellowDim: '#D9AE13', ink: '#0B0B0C' },
  surface: { base, raised, sunken, inverse },
  text:    { primary, secondary, muted, inverse, onBrand: '#0B0B0C' },
  border:  { subtle, default, strong, focus },
  status:  { success, warning, danger, info, neutral },
  stage:   { booked, pickup, atHub, pressing, ready, out, delivered, failed, hold }
}
space:  4pt base → 0,1,2,3,4,6,8,10,12,16,20,24  (×4 px)
radius: { sm 6, md 10, lg 14, xl 20, pill 999 }
type:   Inter (UI) + Inter Tight (display); 12/14/16/18/20/24/30/36/48
        tabular-nums on ALL money and quantity columns
shadow: xs sm md lg   (subtle; this is a working tool, not a landing page)
motion: fast 120ms · base 180ms · slow 260ms · easing cubic-bezier(.2,.8,.2,1)
        all animation gated on prefers-reduced-motion
z:      base 0 · sticky 10 · dropdown 20 · overlay 30 · modal 40 · toast 50
```

`color.stage` is a deliberate token group: garment stage is the most-repeated visual concept in
the product, appearing on the production board, the order timeline, the tracking page and the
job card. Defining it once means a rider and a founder read the same colour for "Pressing".

### 2.3 Components

`shadcn/ui` (Radix + Tailwind) copied into `components/ui` and re-themed with IronMan tokens.
Radix gives correct focus management, keyboard behaviour and ARIA for free — which is most of
the accessibility work done before it starts.

Product patterns built on top (`components/patterns`):

`DataTable` (sortable, filterable, column visibility, sticky header, row density, CSV/Excel
export, virtualised past 200 rows) · `StageBadge` · `OrderTimeline` · `MoneyText` ·
`QtyStepper` · `SlotPicker` (capacity-aware) · `ScanInput` (camera + keyboard-wedge scanner) ·
`ProofCapture` · `AsyncBoundary` (§5) · `FilterBar` · `StatTile` · `TrendChart` ·
`ConfirmDialog` (typed confirmation for destructive actions) · `EmptyState` · `PageHeader`.

### 2.4 Icons — SVG discipline

The brief asks for strong SVG icon usage. The rules:

- **Lucide** as the base set — `lucide-react` on web and `lucide-react-native` on mobile, the
  same glyphs and the same names on both platforms. That consistency is why it is chosen over
  Heroicons or Phosphor.
- **Custom IronMan glyphs** for domain concepts Lucide has no honest icon for: pressing iron,
  garment bag, hanger, shirt/trouser/saree, watchman, apartment tower, scan tag. Drawn on a
  24×24 grid, 1.75 px stroke, round caps, `currentColor` only — never a hardcoded hex, so a
  single icon works on light, dark, yellow and inverse surfaces.
- Delivered through an **SVG sprite** (`components/icons/sprite.svg`) with a typed `<Icon
  name="hanger" />` wrapper. One HTTP request, cached, and no per-icon React component tree.
- Every decorative icon is `aria-hidden="true"`; every meaningful icon carries a `<title>` or an
  accessible label. **An icon-only button without an accessible name is a CI failure**, not a
  review comment.
- No icon fonts. No raster icons. No inline `<svg>` copied into feature code.

### 2.5 Consistency enforcement

- Tailwind config consumes tokens; **arbitrary values (`text-[#ff0]`, `p-[13px]`) are lint
  errors.** Consistency that depends on discipline does not survive a deadline.
- Storybook for `ui` and `patterns`, with light/dark and mobile/desktop viewports.
- Chromatic-style visual regression on the component library (optional but recommended before
  the first client demo).

## 3. Responsiveness

Breakpoints: `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`. Baseline **320 px**.

| Surface | Approach |
|---|---|
| **Shop (S1)** | Mobile-first. Single column to `md`. The booking wizard is one step per screen on mobile and a two-pane summary layout from `lg`. Thumb-reachable primary action, always. |
| **Console (S2)** | Desktop-first but never broken. `≥xl` full table + side detail panel · `lg` table with a drawer · `md` (tablet/operator) card list with the 4 fields that matter · `sm` a genuinely usable read-and-act view, not a squashed table. **The operator's tablet is a first-class target, not a fallback.** |
| **Field (S3)** | Mobile-only design. Large tap targets (≥48 px), one primary action per screen, single-hand reach, usable outdoors in sunlight (high contrast, no thin grey text). |

Every table has an explicit card layout below `md` — horizontal scrolling on a phone is a
failure state, not a responsive strategy. Rendering is verified at 320/375/414/768/1024/1440/1920.

## 4. State management & data

| Concern | Tool | Note |
|---|---|---|
| Server state | **TanStack Query** | Caching, background refetch, optimistic updates, retry. The default answer for anything that came from the API. |
| Forms | **React Hook Form + Zod** | Zod schemas generated from the OpenAPI schema, so client validation cannot drift from server validation |
| Client state | **Zustand**, sparingly | Filter bars, drawer state, the offline queue |
| URL state | `nuqs` | Filters, pagination and tabs live in the URL — a shareable console link is an ops feature |
| Offline (field) | IndexedDB (Dexie) + a mutation queue | See §6 |
| Auth | httpOnly cookie (console) / secure storage (mobile) | Never `localStorage` for tokens |

**Rule: no `useEffect` fetching.** Server data comes from TanStack Query or an RSC loader.

## 5. The five states — `R-808`

Every view that touches data implements all of these. Enforced by `AsyncBoundary`, which makes
the correct implementation the shortest one to write:

```tsx
<AsyncBoundary
  query={ordersQuery}
  loading={<OrdersTableSkeleton rows={8} />}
  empty={<EmptyState
    icon="package-open"
    title="No orders yet today"
    body="New bookings will appear here as they come in."
    action={<Button href="/console/orders/new">Create an order</Button>} />}
  error={(e, retry) => <ErrorState error={e} onRetry={retry} />}
  forbidden={<PermissionDenied required="orders.view" />}
>
  {(data) => <OrdersTable data={data} />}
</AsyncBoundary>
```

| State | Requirement |
|---|---|
| **Loading** | Content-shaped skeletons, never a centred spinner on a full page. Skeleton matches the real layout so nothing shifts (CLS < 0.1). Buttons show inline pending state and disable to prevent double-submit. |
| **Empty** | Distinguish *no data yet* from *no results for these filters* — they need different copy and different actions. Always an icon, a plain-language line, and the action that resolves it. |
| **Error** | Human message from `error.message` (`04 §2`), a **Retry** that actually retries, a support path, and the `request_id` shown in small text so a screenshot is diagnosable. Never a raw stack trace, never "Something went wrong" alone. |
| **Offline / network** | A persistent banner when `navigator.onLine` is false or three consecutive requests fail. On the field surface, queued writes show as "Saved on this phone · will sync" with a count and a manual **Sync now**. Reads fall back to the cached snapshot with an "as of HH:MM" stamp. |
| **Permission denied** | Explain what is missing and who to ask. **Actions the user cannot perform are not rendered at all** — a disabled button that never explains itself is worse than an absent one. |
| **404** | Custom page, brand-consistent, with search and the three most likely destinations for the current role. A logged-in operator hitting a dead link gets console links, not a marketing homepage. |
| **Partial / stale** | If some widgets on a dashboard fail, the rest render; the failed tile shows its own inline error. One bad query does not blank a page. |

### Toasts (`R-808`, brief)

`sonner`, top-right on desktop and top-centre on mobile. Success 4 s, error persistent until
dismissed. **Every mutation resolves to a toast**, and destructive mutations offer **Undo** for
5 seconds where the backend supports a reversal (cancel order, void accrual) — an undo window
prevents far more incidents than a confirmation dialog does. Toasts are `role="status"` /
`role="alert"`, so screen readers announce them. Never more than three stacked.

## 6. Offline strategy (field surface) — `R-304`

```
Action tap
   └─▶ write to IndexedDB queue (client_op_id = uuid)   ─── immediate optimistic UI
        └─▶ background sync when online
             └─▶ POST /fulfilment/sync (batch)
                  ├─ applied   → clear from queue
                  ├─ conflict  → surface to the rider with the server's state and a choice
                  └─ rejected  → surface with the reason; never silently dropped
```

- Today's jobs, the customer contacts and the garment catalogue are pre-cached on login.
- Proof photos are stored as blobs and uploaded opportunistically; the job completes locally
  without waiting for the upload.
- A service worker (Workbox) provides the app shell, an offline fallback page, and background
  sync.
- **Non-negotiable:** the queue is never cleared without a server acknowledgement, and the rider
  always sees how many operations are pending. Losing a delivery confirmation loses the on-time
  KPI and, potentially, the cash record.

## 7. Accessibility — `R-809`, WCAG 2.2 AA

| Area | Commitment |
|---|---|
| Contrast | ≥4.5:1 body, ≥3:1 large text and UI boundaries. Yellow rule per §2.1. Verified in CI. |
| Keyboard | Every flow completable without a mouse. Visible 2 px focus ring on `--border-focus`. Logical tab order. Focus trapped in modals and restored on close. |
| Semantics | Landmarks, one `h1` per page, headings in order, real `<table>` for tabular data, `<button>` for actions and `<a>` for navigation. |
| Forms | Every input labelled. Errors linked with `aria-describedby` and announced. Never colour alone to signal error. |
| Live regions | Toasts, async results, background sync status. |
| Motion | All animation respects `prefers-reduced-motion`. |
| Targets | ≥44×44 px (WCAG 2.2 AA target size), ≥48 px on the field surface. |
| Status colour | Every stage badge pairs colour with **text and an icon** — a colour-blind operator must read the board as fast as anyone else. |
| Testing | `axe-core` in Playwright on every key route in CI, **plus** a manual keyboard and screen-reader pass (NVDA + VoiceOver) on the six critical flows before each phase ships. Automated checks catch about a third of real issues; the manual pass is not optional. |
| Language | `lang` attribute set; copy written at a plain-English reading level. Hindi/Kannada localisation is scaffolded (see §9) though v1 ships English. |

## 8. Performance budgets

| Metric | Booking page (S1) | Console (S2) | Field (S3) |
|---|---|---|---|
| LCP (4G, mid Android) | **< 1.8 s** | < 2.5 s | < 2.0 s |
| INP | < 200 ms | < 200 ms | < 200 ms |
| CLS | < 0.1 | < 0.1 | < 0.1 |
| Initial JS (gzip) | **< 130 KB** | < 300 KB | < 180 KB |
| TTI | < 2.5 s | < 3.5 s | < 2.5 s |

Techniques: RSC for shop routes, route-level code splitting, `next/font` self-hosted with
`font-display: swap`, `next/image` with AVIF/WebP, SVG sprite (§2.4), charts (`recharts`) and
PDF viewers dynamically imported, tables virtualised past 200 rows, TanStack Query
`staleTime` tuned per resource. Budgets enforced by Lighthouse CI on PRs — a regression fails
the build.

The booking page budget is the strictest deliberately: it is opened from a WhatsApp message by a
first-time customer on a mid-range Android phone on 4G, and it is the *only* moment where a slow
page costs a customer.

## 9. Internationalisation

v1 ships English. But `next-intl` is wired from the first commit with all user-facing strings in
message catalogues, because the customers are apartment residents in Bengaluru and Hindi/Kannada
is a realistic near-term ask — and retrofitting i18n across a finished product is a week of
mechanical misery. Dates, numbers and currency use `Intl` with `en-IN` (₹, lakh/crore grouping)
from day one.

## 10. Mobile apps (Phase 8–9) — what is honestly shared

`00 §5 T-1` corrected SRC-B's claim of shared components. The real picture:

| Shared | Not shared |
|---|---|
| `packages/tokens` — colours, spacing, type, radii, motion | Components (shadcn is DOM-only; RN needs its own primitives) |
| `packages/api-client` — generated types and calls | Navigation (App Router vs React Navigation) |
| Zod schemas and validation | Styling engine (Tailwind vs NativeWind) |
| Business rules, formatters, permission helpers | Layout (flexbox differs meaningfully in RN) |
| Icon *names* (Lucide on both) | Icon rendering |

**Budget for building the component layer twice.** Planning for it makes Phase 8 predictable;
discovering it makes Phase 8 slip. Stack: Expo SDK 52+, expo-router, NativeWind, TanStack Query,
MMKV, expo-notifications (FCM), expo-camera (barcode scanning), Expo EAS Build + OTA updates for
JS-only fixes.

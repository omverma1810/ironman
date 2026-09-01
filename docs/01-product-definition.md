# 01 — Product Definition

## 1. Core purpose

> **IronMan's platform is a route-and-cluster operations system whose primary output is
> trustworthy per-apartment, per-channel unit economics.**

Booking, custody, billing and messaging are the *instrumentation*. The founders' 30/60/90 plan
is a sequence of decisions — *which apartments, which channels, what price, what commission* —
and each decision is only as good as the data behind it. The software exists to make those
decisions cheap, fast and correct.

Three consequences that shape the whole design:

1. **Every operational fact carries its dimensions.** An order is never just an order — it is
   an order *for* an apartment, *from* a channel, *credited to* a referral partner, *served by*
   a route-day, *priced at* a version of the price list. Dimensions are captured at write time,
   never reconstructed later.
2. **Configuration is versioned, not mutated.** The client has said prices, commissions,
   discounts and spend will all be tested. A test you cannot reproduce is not a test.
3. **Physical reality must be forced into the system, not typed into it.** A garment stage that
   depends on someone remembering to tap a dropdown will be wrong by week three. Stage changes
   happen by scanning a tag.

## 2. Scope boundary

**In scope for v1:** the full order lifecycle from booking to cash-in-bank for a single hub
serving 3–5 apartment clusters, plus the founders' weekly analytics.

**Out of scope for v1** (carried forward from SRC-B §4, which was correct):
GST/accounting-suite integration · multi-city or multi-warehouse · IoT integration with the
pressing machine · sneaker cleaning and other services *(the catalogue supports them; no
service-specific UI is built)* · AI demand forecasting or dynamic pricing · loyalty points
beyond referral credit · franchise / white-label management.

**Deliberately deferred, not excluded:** native mobile apps (Phase 8–9), payment gateway
(Phase 3), packages/subscriptions (post-pilot), route optimisation (never, at this density).

## 3. Roles

Five roles, mapped to real people in a 3–8 person operation. Note that one person routinely
holds two roles — the founder *is* the ops manager in month one — so roles are additive
assignments, not exclusive types.

| Role | Who | Primary surface | Owns |
|---|---|---|---|
| **Customer** | Apartment resident | Mobile web link → later native app | Their own orders, addresses, feedback, referral code |
| **Field Staff** | Pickup/delivery rider | Field PWA on their phone → later native app | Their assigned jobs, proof capture, cash they hold |
| **Store Operator** | Person at the press | Console on a tablet at the hub | Intake verification, production board, consumables issue |
| **Ops Manager / Admin** | Operations lead | Console on desktop | All orders, assignment, customers, apartments, exceptions, settlements |
| **Founder / Owner** | The two founders | Console on desktop | Everything, plus money: pricing, commissions, spend, margins, analytics |

**Support role — `Viewer`**: read-only console access with money fields masked, for anyone
helping out (an intern, an accountant) without giving away the pricing model.

Full permission matrix: `06-security-privacy-rbac.md` §3.

## 4. Surfaces

Three distinct user surfaces, **two codebases**, shipped in a deliberate order.

```
                          ┌──────────────────────────────┐
                          │      Django REST API         │
                          │   (one backend, all clients) │
                          └──────────────┬───────────────┘
             ┌───────────────────────────┼───────────────────────────┐
             │                           │                           │
   ┌─────────▼─────────┐      ┌──────────▼──────────┐     ┌──────────▼──────────┐
   │  S1 · Customer    │      │  S2 · Ops Console   │     │  S3 · Field         │
   │  booking + track  │      │  admin / operator / │     │  pickup + delivery  │
   │                   │      │  founder            │     │                     │
   │  Public, no login │      │  Login required     │     │  Login required     │
   │  Phase 4          │      │  Phase 2 (FIRST)    │     │  Phase 2            │
   └─────────┬─────────┘      └─────────────────────┘     └──────────┬──────────┘
             │                  ── Next.js 15 web app ──             │
             │                                                        │
   ┌─────────▼─────────┐                                   ┌──────────▼──────────┐
   │  S4 · Customer    │                                   │  S5 · Field         │
   │  native app       │                                   │  native app         │
   │  Phase 8          │                                   │  Phase 9            │
   └───────────────────┘   ──── Expo / React Native ────   └─────────────────────┘
```

### The two sequencing decisions that matter

**(a) The field surface ships as a PWA in Phase 2, not as a native app in Phase 9.**
The project brief says "web first, mobile later" — but field staff need a phone on pilot day
one. Building the field surface as mobile-first routes in the same Next.js app (`/field/*`)
means the pilot can run on any Android phone's browser, with no store submission, no review
delay and no install friction. The native app then *adds* offline-by-default, camera scanning
and push — it does not gate the pilot. **This resolves the apparent conflict between "web
first" and "staff are mobile" without splitting the schedule.**

**(b) The customer surface is a link, not an app.**
Per SRC-A p.3 and `00 §3.2 P-1`. A tokenised booking and tracking link shared over WhatsApp
requires zero installs from a first-time customer. The native app in Phase 8 is a *retention*
product for the 50–60 repeat customers the founders are targeting — the people who have already
decided IronMan is worth space on their home screen.

## 5. The three state machines

`00 §3.3 M-3` established that SRC-B's single status chain conflates three independent
lifecycles. They are modelled separately and advance independently.

### 5.1 Order lifecycle

```
                    ┌──────────────── cancel (any pre-delivery state) ────────────┐
                    │                                                             ▼
  DRAFT ──▶ PENDING_CONFIRMATION ──▶ SCHEDULED ──▶ PICKUP_ASSIGNED ──▶ PICKUP_EN_ROUTE
                                          ▲                │                      │
                                          │                │                      ▼
                                          └── reschedule ──┴──────────────── PICKUP_FAILED
                                                                                  │
                                          ┌───────────────────────────────────────┘
                                          ▼
                                      PICKED_UP ──▶ AT_HUB ──▶ INTAKE_VERIFIED ──▶ IN_PRODUCTION
                                                                    │                     │
                                          ┌── customer rejects ─────┘                     ▼
                                          ▼      re-quote                              READY
                                     ON_HOLD ◀──────────────────────────────────────────┤
                                          │                                              ▼
                                          └──────────────────────▶ DELIVERY_ASSIGNED ──▶ OUT_FOR_DELIVERY
                                                                          ▲                    │
                                                                          │                    ▼
                                                     RETURNED_TO_HUB ◀────┴──────────── DELIVERY_FAILED
                                                                                              │
                                                                                              ▼
                                                                                         DELIVERED ──▶ CLOSED
```

| State | Meaning | Exit condition |
|---|---|---|
| `DRAFT` | Booking started, not submitted | Customer submits |
| `PENDING_CONFIRMATION` | Submitted; slot not yet confirmed (e.g. WhatsApp booking awaiting ops confirmation) | Ops or auto-confirm accepts a slot |
| `SCHEDULED` | Slot committed. **This is where the on-time promise is recorded.** | Job assigned |
| `PICKUP_ASSIGNED` | Field staff assigned to the pickup job | Staff starts the job |
| `PICKUP_EN_ROUTE` | Staff marked "on the way" | Arrival + collection, or failure |
| `PICKUP_FAILED` | Customer absent / cancelled at door / no garments | Reschedule → `SCHEDULED`, or cancel |
| `PICKED_UP` | Garments in staff custody, declared count recorded | Arrival at hub |
| `AT_HUB` | Bags received at the hub, not yet counted | Operator starts intake |
| `INTAKE_VERIFIED` | **Verified counts recorded, invoice basis fixed.** If variance > threshold, customer is notified and may need to approve | Production starts, or `ON_HOLD` |
| `IN_PRODUCTION` | One or more garments in a pressing stage | All garment lines reach `PACKED` |
| `READY` | Packed, awaiting delivery slot | Delivery job assigned |
| `DELIVERY_ASSIGNED` → `OUT_FOR_DELIVERY` | With the field staff | Delivered or failed |
| `DELIVERY_FAILED` | Attempt 1 or 2 failed; reason recorded | Retry, or `RETURNED_TO_HUB` |
| `DELIVERED` | Handed over, proof captured | Payment settled and no open exception |
| `ON_HOLD` | Blocked: re-quote rejected, payment dispute, open claim | Blocker resolved |
| `CANCELLED` | Terminal. Records **who** cancelled, **when**, and refundability | — |
| `CLOSED` | Terminal. Paid, no open exceptions, feedback window elapsed | — |

**Invariant:** an order may only reach `CLOSED` when payment status is `PAID` or `WRITTEN_OFF`
and no exception is open.

### 5.2 Payment lifecycle *(independent of order state)*

```
UNPAID ──▶ AUTHORIZED ──▶ PAID
   │            │            │
   │            └──▶ FAILED  └──▶ PARTIALLY_REFUNDED ──▶ REFUNDED
   │
   ├──▶ PARTIALLY_PAID ──▶ PAID
   └──▶ WRITTEN_OFF
```
An order is routinely `DELIVERED` + `UNPAID` (COD not yet handed over by the rider). That
combination is *normal*, and it is exactly what `R-405` cash custody exists to close.

### 5.3 Garment-line lifecycle *(per bag / per item)*

```
RECEIVED ──▶ SORTED ──▶ PRESSING ──▶ PRESSED ──▶ QC ──┬─▶ PACKED ──▶ DISPATCHED ──▶ DELIVERED
                            ▲                          │
                            └──────── REWORK ◀─────────┘  (QC fail)

  exception branches (from any state): DAMAGED · LOST · HELD · RETURNED_UNPRESSED
```

Each transition is written by a **scan** of the bag QR (`R-201`), stamped with actor, timestamp
and hub. The production board (`R-204`) is a projection of these events.

## 6. Corrected MVP feature set

Supersedes SRC-B §3. Priorities per `00 §6`. `M` items are the pilot launch bar.

### 6.1 Customer (S1 web link → S4 app)

| Ref | Feature | Pri | Change vs SRC-B |
|---|---|---|---|
| C-1 | Book via no-install link: apartment → flat → service → estimated counts → slot → notes | **M** | Slot now capacity-constrained (`R-104`) |
| C-2 | WhatsApp booking entry point (template → link) | **M** | **Promoted** from Nice-to-Have |
| C-3 | Tokenised tracking link — live status, no login | **M** | New; replaces "push notifications" as the primary channel |
| C-4 | Re-quote approval when verified count ≠ declared count | **M** | **New** (`M-1`) |
| C-5 | Pay: COD, UPI QR at door | **M** | Gateway split out |
| C-6 | Pay online via gateway | S | Deferred to Phase 3 |
| C-7 | Profile, multiple addresses, default apartment | **M** | — |
| C-8 | Order history, invoice download, one-tap reorder | S | — |
| C-9 | Rating + text feedback after delivery | **M** | — |
| C-10 | Referral code / share link, reward balance | **M** | — |
| C-11 | Notifications: WhatsApp/SMS at each stage; push once app installed | **M** | Channel priority **inverted** (`T-4`) |
| C-12 | Weekly / monthly packages | L | Model supports it; no UI in v1 |
| C-13 | Support chat → WhatsApp hand-off | L | — |

### 6.2 Field staff (S3 PWA → S5 app)

| Ref | Feature | Pri | Change vs SRC-B |
|---|---|---|---|
| F-1 | Today's route-day job list: pickups + deliveries, ordered, with slot windows | **M** | — |
| F-2 | Job card: address + flat, contact, garment summary, notes, maps deep link | **M** | — |
| F-3 | Scan bag QR / one-tap status: arrived → collected / delivered | **M** | Scan added (`G-1`) |
| F-4 | Proof capture: photo and/or delivery OTP | **M** | — |
| F-5 | Declared count entry at pickup; bag tag assignment | **M** | **New** (`M-1`) |
| F-6 | Failure path: reason codes, reschedule, second attempt | **M** | **New** (`M-2`) |
| F-7 | COD collection + **running cash-in-hand balance + handover to hub** | **M** | **Extended** from a log to a ledger (`G-5`) |
| F-8 | Offline write queue with sync | **M** | **Promoted** from Nice-to-Have (`P-2`) |
| F-9 | Call / WhatsApp the customer from the job card | **M** | — |

### 6.3 Store operator (S2 console, tablet)

| Ref | Feature | Pri |
|---|---|---|
| O-1 | Intake screen: scan bag → verify counts by garment type → variance flag → photo | **M** |
| O-2 | Bag tag printing (thermal, QR + order ref + flat + count) | **M** |
| O-3 | Production board: WIP by stage, ageing, due-today, overdue | **M** |
| O-4 | Scan-driven stage transitions, batch scan | **M** |
| O-5 | QC pass/fail → rework loop | **M** |
| O-6 | Exception raise: damaged / lost / missing / re-press | **M** |
| O-7 | Consumables issue and stock count | **M** |
| O-8 | Counter intake (walk-in order creation + token) | **M** |

### 6.4 Ops manager / admin (S2 console)

| Ref | Feature | Pri | Change vs SRC-B |
|---|---|---|---|
| A-1 | Order management: list, filter (status/date/apartment/staff/channel), detail, edit, cancel, reassign | **M** | Channel filter added |
| A-2 | Route-day planning: capacity per cluster, slot availability, job assignment | **M** | **New** (`G-4`) |
| A-3 | Customer management: history, spend, repeat status, attribution, notes, merge duplicates | **M** | Merge added — phone typos are inevitable |
| A-4 | Apartment / cluster / hub master data, serviceability, delivery notes, watchman contacts | **M** | — |
| A-5 | Staff management, roles, shift/route assignment, on-time performance | **M** | — |
| A-6 | Exceptions & claims queue with SLA and resolution | **M** | **New** (`G-6`) |
| A-7 | Invoicing: generate, PDF, credit notes; payment recording | **M** | Credit notes added (`M-5`) |
| A-8 | Cash reconciliation: staff balances, handovers, deposits, variance | **M** | **New** (`G-5`) |
| A-9 | Consumables inventory: stock, receipts, reorder alerts, valuation | **M** | **New** (`G-2`) |
| A-10 | Pricing: effective-dated price lists, per-service, per-garment-type | **M** | Versioning added (`M-5`) |
| A-11 | Offers: first-order discount, referral credit, apartment promos — all rule-based and dated | **M** | — |
| A-12 | Referral partners: register, code, commission rule, accrual view | **M** | — |
| A-13 | Commission settlement: payable balance, settlement run, payout record | **M** | **Extended** from a report (`G-9`) |
| A-14 | Marketing spend entry by channel / campaign / apartment | **M** | **New** (`G-3`) |
| A-15 | Lapsed-customer segment + re-engagement send | **M** | **New** (`G-11`) |
| A-16 | Internal alerts: overdue order, high-value COD outstanding, low rating, open claim | **M** | — |
| A-17 | RBAC administration + audit log viewer | **M** | Audit log **new** (`M-7`) |
| A-18 | Export any list or report to CSV / Excel / PDF | **M** | — |

### 6.5 Founder (S2 console)

| Ref | Feature | Pri |
|---|---|---|
| B-1 | Weekly numbers dashboard — the 10 metrics from SRC-A p.6, defined in `07` | **M** |
| B-2 | Apartment performance: customers, orders, repeat rate, AOV, margin, on-time | **M** |
| B-3 | Channel performance: volume, CAC, repeat rate by channel | **M** |
| B-4 | Unit economics: revenue → COGS → commission → contribution per order | **M** |
| B-5 | Day 30 / 60 / 90 checkpoint report, as-of a chosen date | **M** |
| B-6 | Cohort retention, LTV, apartment heat-map | L |

## 7. Success criteria (measurable — replaces SRC-B §5)

| # | Criterion | Measure |
|---|---|---|
| SC-1 | A customer books, tracks and pays end-to-end without installing anything | Completed booking → delivered → paid, on mobile web, in staging E2E |
| SC-2 | Booking completion rate | ≥ 80% of started bookings submitted; median time-to-book ≤ 90 s |
| SC-3 | Field staff complete pickup + delivery with proof, including offline | 100% of jobs carry proof; queued offline writes reconcile with 0 loss in a 30-min-airplane-mode test |
| SC-4 | Every garment is traceable to a stage at any moment | ≥ 98% of garment-lines have a scan event within the last stage-SLA window |
| SC-5 | Founders' 10 weekly numbers require zero manual spreadsheet work | Dashboard renders all 10 from live data; a founder can reproduce each figure from a drill-down |
| SC-6 | Referral attribution is complete | ≥ 95% of new customers have a non-null acquisition channel; commission payable reconciles to accruals to the rupee |
| SC-7 | On-time is measured against a real promise | 100% of orders in `SCHEDULED`+ have a committed slot timestamp |
| SC-8 | Cash reconciles | Daily staff cash variance = ₹0, or a recorded, attributed exception |
| SC-9 | Performance under real load | 300 active customers, 100 orders/day: p95 API < 400 ms, console LCP < 2.0 s on 4G, booking page LCP < 1.8 s |
| SC-10 | Accessibility | WCAG 2.2 AA: automated axe pass, plus manual keyboard + screen-reader pass on the 6 critical flows |
| SC-11 | Every screen handles every state | Loading, empty, error, offline, permission-denied and 404 states implemented and visually reviewed for all data views |

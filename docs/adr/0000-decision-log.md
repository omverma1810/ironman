# Architecture Decision Log

Each entry: the decision, why, what was rejected, and what would make us revisit. Format is
deliberately compact — an ADR nobody reads is an ADR that does not constrain anything.

---

## ADR-001 — Modular monolith, not microservices

**Decision.** One Django project, thirteen internal apps with enforced import boundaries, one
Postgres, one deployable.

**Why.** The client's own success criterion is 100–300 customers and 50–100 orders/day — roughly
5 requests/second at peak. The hard problems here are correctness (cash, custody, attribution)
and adoption, not throughput. A monolith gives transactional consistency across order, invoice,
stock and commission in a single database transaction — which is precisely what a service split
would take away, in exchange for solving a scaling problem that does not exist.

**Rejected.** Microservices (distributed transactions to solve a 5 rps problem); serverless
functions (cold starts, no long-lived Celery, harder local dev).

**Revisit if.** A single context needs independent scaling or a separate team owns it. The
import-linter boundaries mean extraction is a refactor, not a rewrite.

---

## ADR-002 — One Next.js app with three route groups

**Decision.** `apps/web` serves the customer shop (SSR/RSC), the ops console (client-rendered)
and the field PWA (client-rendered, offline-capable).

**Why.** One design system, one auth client, one deploy, one set of conventions. The public shop
genuinely benefits from RSC and SSR — it is opened from a WhatsApp message by a first-time user
on 4G, and first paint is the whole game. The console does not; it is auth-gated, table-heavy
and interactive, so it is rendered on the client rather than fighting RSC over auth-scoped data.

**Rejected.** *Separate Vite SPA for the console* — simpler individually, but duplicates the
design system, auth and CI, and the duplication drifts. *Everything RSC* — awkward for
optimistic updates and offline. *Three separate apps* — three deploys for one small team.

**Revisit if.** The console's bundle starts to hurt the shop's budgets (route-level splitting
should prevent this), or the console outgrows a single team.

---

## ADR-003 — Split authentication by audience

**Decision.** Customers: phone OTP → JWT with rotating refresh. Staff/admin/founder: email +
password → httpOnly session cookie, with mandatory TOTP for admin and founder. Field staff may
use either.

**Why.** Indian consumers expect phone OTP; forcing email/password on them adds friction the
client explicitly warned against (*"make it very easy"*). Conversely, cookie sessions with CSRF
protection are the safer default for a long-lived console that can change prices and settle
money. One scheme for both audiences means compromising one of them.

**Rejected.** JWT everywhere (token storage in a browser is a liability for a money surface);
sessions everywhere (poor fit for a native app); a third-party identity provider (cost and an
external dependency for eight staff and a few hundred customers).

---

## ADR-004 — Money as integer minor units

**Decision.** `BIGINT` paise plus a currency code. Never float, never `Decimal` at API
boundaries, never a bare number in JSON.

**Why.** The business runs on ₹15 items with percentage commissions and percentage discounts.
Floating point loses money slowly and invisibly; a wrong rounding rule on a ₹3 commission across
36,000 orders is a real number. Integers make the rounding rule explicit and testable.

**Rejected.** `NUMERIC(12,2)` (safe in the database but tempting to convert to float in Python
or JavaScript); float (never acceptable for money).

---

## ADR-005 — Effective-dated pricing with order-time snapshots

**Decision.** `PriceList` is versioned with `effective_from`/`effective_to`. Activated versions
are immutable. Orders record their `price_list_version` and denormalise unit prices at intake.

**Why.** The client states outright that pricing will be tested and changed (SRC-A p.6). Mutating
a price row would make historical invoices unreproducible and every margin trend meaningless —
destroying the evidence from the very experiments the plan is built around. This decision is
what makes `07 §3`'s *"at ₹15 we did X, at ₹18 we did Y"* comparison possible at all.

**Rejected.** Mutable price rows with an audit trail (the audit trail records the change but
cannot re-derive the invoice); event sourcing the whole domain (far more machinery than the
problem needs).

---

## ADR-006 — Append-only events and audit log

**Decision.** `AuditEvent`, `OrderEvent`, `StageEvent`, `CreditEntry`, `StockMovement`,
`CommissionAccrual` and `Attribution` are append-only, with `UPDATE`/`DELETE` revoked from the
application database role.

**Why.** Money owed to third parties, cash held by staff and customer attribution all need to be
non-repudiable. Enforcing it at the database grant level means a future well-intentioned
`.update()` cannot quietly rewrite history.

**Rejected.** Application-level immutability only (bypassable); full event sourcing (the read
model complexity is not justified here).

---

## ADR-007 — QR-tagged bags as the physical/digital bridge

**Decision.** Every intake produces one or more physically tagged bags carrying a short opaque
QR code. Stage transitions are recorded by scanning that code. Manual transitions remain possible
but are flagged and reported.

**Why.** 500–1,000 garments/day through one shop. Any tracking system that depends on a busy
operator remembering to open a dropdown will be wrong within days, and wrong inventory data is
worse than none — it produces confident false answers. A scan is *faster* than the alternative,
which is the only reliable way to make a workflow stick. Cost: a sub-₹3,000 thermal printer.

**Rejected.** Per-garment tagging (10× the labour at this volume — see `09` D-20); manual status
dropdowns alone (`00 §4 G-1`); RFID (cost and hardware complexity).

**Revisit if.** Single-garment loss claims become frequent enough to justify per-item tags.

---

## ADR-008 — Declared vs verified counts; invoice from verified

**Decision.** Orders carry a declared estimate (booking/pickup) and a verified actual (intake).
Billing derives from verified only. Variance above a threshold triggers a customer re-quote and
holds the order.

**Why.** Customers estimate their laundry badly and always will. SRC-B's model treats the booking
count as final (`00 §3.3 M-1`), which would either produce wrong invoices or force a manual
override on a large share of orders. The threshold exists so that a one-shirt discrepancy does
not stall the shop while a fifteen-shirt discrepancy is never absorbed silently.

**Rejected.** Bill from declared (wrong); always require re-approval (stalls production);
silently bill the actual (destroys trust the first time a customer notices).

---

## ADR-009 — Capacity-constrained slot booking

**Decision.** Slots are inventory: capacity per cluster per day per window, decremented under a
row lock at booking. Daily pressing throughput is a separate cap.

**Why.** On-time performance is a founder KPI (SRC-A p.6) and a promise cannot be kept if the
system accepts unlimited bookings against finite riders and one press. Unconstrained booking
converts a demand problem into a broken-promise problem — the worse of the two.

**Rejected.** Unconstrained booking with manual triage (guarantees misses); a full optimisation
model (over-build for 3–5 walkable apartments).

---

## ADR-010 — WhatsApp-first customer entry; native apps are additive

**Decision.** Booking and tracking are no-install web links, distributed primarily over WhatsApp.
Native apps ship in Phases 8–9 as a retention product.

**Why.** SRC-A p.3 names WhatsApp first. Requiring a first-time customer in an apartment block to
install an app to try a ₹15 service is the largest adoption risk in the plan. SRC-B inverted this
(`00 §3.2 P-1`). The founders' own target — 50–60 repeat customers out of 100 — describes exactly
who an app is worth building for: people who have already decided.

**Rejected.** App-first (adoption risk); WhatsApp-conversational-only (no structured data, and
every order becomes manual entry).

---

## ADR-011 — Nightly rollups in Postgres, no warehouse

**Decision.** Analytics served from nightly materialised fact and aggregate tables in the same
Postgres. Idempotent, re-runnable, backfillable.

**Why.** ~36,000 orders/year. Rollup tables have thousands of rows and answer every founder query
in milliseconds with no second system to operate, secure or back up. A warehouse here would be
equipment for its own sake.

**Rejected.** Live aggregation over transactional tables (slow and load-coupled); ClickHouse or
BigQuery + dbt (operational overhead with no benefit at this size).

**Revisit if.** Order volume approaches ~1M rows or sub-minute freshness is required.

---

## ADR-012 — Idempotency everywhere writes can be retried

**Decision.** `Idempotency-Key` on order creation, payment recording and job completion;
`client_op_id` on offline sync; unique event ids on gateway webhooks; `dedupe_key` on
notifications.

**Why.** Every one of these paths runs over an unreliable network held by a person who will tap
twice. Without idempotency the failure modes are duplicate orders, double-counted cash and a
customer receiving the same delivery message four times — each of which destroys trust faster
than the outage that caused it.

---

## ADR-013 — Multi-hub-ready schema, single-tenant product

**Decision.** Every operational row carries `hub_id`, and role scoping is hub-aware. No
tenant-level isolation, no per-tenant configuration, no tenant onboarding.

**Why.** The client's stated 90-day goal is to repeat the model in the next cluster and the next
neighbourhood (SRC-A p.7). A column and a scoping mixin now cost nothing; adding them later is a
migration across every table while the system is live. But building actual multi-tenancy for a
business with one shop would be speculative work for a customer that does not exist.

---

## ADR-014 — Soft delete with anonymisation, never hard delete

**Decision.** Customer deletion anonymises PII and retains financial rows against a tombstoned
customer. Apartment linkage is retained; flat number and free-text address are cleared.

**Why.** DPDP erasure rights and statutory financial-record retention both apply and appear to
conflict; anonymisation satisfies both. Retaining the apartment link matters because the entire
analytics model is apartment-dimensioned — hard deletion would silently corrupt the founders'
history every time a customer left.

**Rejected.** Hard delete (destroys required records and corrupts analytics); retain everything
and merely deactivate (does not satisfy erasure).

---

## ADR-015 — Polling with ETags, not websockets

**Decision.** The production board and route-day board poll every 15–30 seconds with
`If-None-Match`. The tracking page polls every 30 seconds while visible.

**Why.** Two boards need near-real-time updates. ETagged polling costs almost nothing in the
steady state and needs no connection state, no reconnect logic, no sticky sessions and no extra
infrastructure. Websockets would add all four to solve a problem that a 15-second refresh already
solves for a shop floor.

**Revisit if.** The pilot shows visible lag — the next step is SSE, not websockets.

---

## ADR-016 — Field surface ships as a PWA before a native app

**Decision.** The field staff surface launches as mobile-first routes in the Next.js app with an
IndexedDB offline queue and a service worker. The Expo app follows in Phase 9.

**Why.** The brief asks for web first, but riders need phones on pilot day one. A PWA resolves
that without splitting the schedule: no store submission, no review delay, no install friction,
and it runs on whatever Android phone the rider already owns. The native app then adds
offline-by-default, native camera scanning and push — genuine improvements, but not
prerequisites for running a pilot.

**Rejected.** Native-first (blocks the pilot behind store review); paper-and-WhatsApp until Phase
9 (loses exactly the proof and on-time data the founders' KPIs need).

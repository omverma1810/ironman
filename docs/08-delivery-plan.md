# 08 — Delivery Plan

## 1. How this plan is structured

Work is organised as **phases** (a coherent slice of product) made of **batches** (one working
session / one PR each). Phases have **hard exit criteria** — a phase is not "done" because the
code was written, it is done when its criteria pass on staging.

**Effort is given in engineer-days, not calendar dates.** Calendar estimates on a project with
unconfirmed requirements and two external onboarding queues (WhatsApp, DLT) are fiction. Once
`09-open-decisions.md` is answered and team size is fixed, days convert to dates.

**Sequencing principle:** *build the thing the business cannot run without, first.* The
operation exists today — orders arrive by WhatsApp and get handled by hand. What is genuinely
missing is garment custody, billing, attribution and measurement. So the **ops console and field
app come before customer self-service booking**, and orders can be entered by ops from day one.
The customer-facing surface then removes manual entry rather than being a prerequisite for it.

This is deliberately the opposite of the intuitive order, and it is the single most important
sequencing decision in the plan: **it means the pilot can start after Phase 3, not after Phase 7.**

## 2. Phase map

```
P0  Foundations ──▶ P1  Backend core ──▶ P2  Ops console + Field PWA ──▶ P3  Money
                                                                            │
                                        ┌───────────────────────────────────┘
                                        ▼
                                   ★ PILOT CAN START HERE ★
                                        │
     P4  Customer web + messaging ──▶ P5  Growth ──▶ P6  Analytics ──▶ P7  Hardening + launch
                                        │
                                        └──▶ P8  Customer app ──▶ P9  Field app
```

---

## Phase 0 — Foundations & external lead times

**Goal:** nothing blocks Phase 1, and the two long-lead external processes are already running.

| Batch | Work | Days |
|---|---|---|
| 0.1 | Monorepo scaffold (pnpm workspaces), `apps/api`, `apps/web`, `packages/tokens`, `packages/api-client` | 1 |
| 0.2 | Django project, settings split, docker-compose (Postgres 17, Redis, MinIO), base models, money type, enums, error envelope | 2 |
| 0.3 | Next.js 15 app, Tailwind + tokens, shadcn/ui init, icon sprite pipeline, Storybook | 2 |
| 0.4 | CI: lint, type-check, test, migration drift, import-linter, security scan, Lighthouse CI. Staging + preview environments live, Sentry wired | 2 |
| 0.5 | **Start WhatsApp Business API onboarding and TRAI DLT registration** | 0.5 + waiting |
| 0.6 | Design foundations: token set, 3 key screens in Figma or code (booking, orders list, job card), component inventory | 3 |
| 0.7 | Client decision workshop → close `09-open-decisions.md` | 1 |

**Exit:** `main` deploys green to staging · a "hello world" authenticated call works end to end ·
WhatsApp and DLT applications submitted · every `09` decision has an answer or a signed-off
assumption.

> **Start 0.5 on day one.** WhatsApp business verification and DLT template approval take 1–3
> weeks of somebody else's time. Neither source document mentions them (`00 §5`), and they are
> the most likely cause of a launch slipping for a reason nobody can code around.

---

## Phase 1 — Backend core domain

**Goal:** the whole domain model exists, is enforced by tests, and is operable through Django
Admin. Ops could run the business from Django Admin at the end of this phase — ugly, but real.

| Batch | Work | Days |
|---|---|---|
| 1.1 | `identity`: users, roles, permissions, hub scoping, OTP, JWT + session auth, invite flow, email verification, password reset, audit log | 4 |
| 1.2 | `territory`: hubs, clusters, apartments, contacts, service areas, capacity model | 2 |
| 1.3 | `catalog`: services, garment types, **effective-dated price lists**, offers, `POST /catalog/quote` | 3 |
| 1.4 | `customers`: customers, addresses, consent, merge, duplicate detection | 2 |
| 1.5 | `ordering`: orders, lines, slots with capacity locking, state machine + transitions, events, exceptions, re-quote | 5 |
| 1.6 | `custody`: bags, garment lines, stage events, scan endpoint, intake verification, QC/rework | 4 |
| 1.7 | `fulfilment`: route days, jobs, attempts, proofs, offline sync endpoint, on-time computation | 4 |
| 1.8 | Django Admin configured for every model (ops-usable, not just developer-usable) | 2 |
| 1.9 | Seed/fixture command: 2 clusters, 6 apartments, 40 customers, 200 orders across all states | 1 |
| 1.10 | OpenAPI schema + generated TS client in CI | 1 |

**Exit:** an order can go booking → delivered through the API with correct state validation ·
DB invariants (`02 §5`) enforced and tested · RBAC matrix tests pass for every cell ·
service-layer coverage ≥ 85% · seed data supports frontend work without a backend engineer.

---

## Phase 2 — Ops console + Field PWA ★ the operational core

**Goal:** the team stops using paper and WhatsApp threads for operations.

| Batch | Work | Days |
|---|---|---|
| 2.1 | App shell: auth, role-aware navigation, `AsyncBoundary`, all five states, toasts, 404, error boundary | 3 |
| 2.2 | `DataTable` pattern: sort, filter, URL state, column visibility, density, export, virtualisation, **mobile card fallback** | 3 |
| 2.3 | Orders: list, filters, detail, timeline, create, edit, cancel, reschedule, reassign | 4 |
| 2.4 | **Intake screen**: scan → verify counts → variance → photos → re-quote trigger | 3 |
| 2.5 | **Bag tag printing**: QR payload, 58 mm label layout, print flow, reprint | 2 |
| 2.6 | **Production board**: WIP by stage, ageing, due today, overdue, batch scan, QC/rework | 4 |
| 2.7 | Route-day planning: capacity view, slot management, job assignment | 3 |
| 2.8 | Customers, apartments, clusters, staff master-data screens | 3 |
| 2.9 | Exceptions queue with SLA and resolution | 2 |
| 2.10 | Counter/walk-in intake (POS) | 2 |
| 2.11 | **Field PWA**: login, today's jobs, job card, scan, proof capture, failure paths, maps deep link | 5 |
| 2.12 | **Field offline queue**: IndexedDB, service worker, batch sync, conflict surfacing | 4 |
| 2.13 | Supplies: stock items, receipts, issues, adjustments, reorder alerts, consumption rules | 3 |

**Exit:** a full day of real operations runs on staging with real staff · every garment
traceable by scan · offline test — 30 minutes in airplane mode, zero data loss · console usable
on an operator's tablet · field PWA usable one-handed outdoors · every screen implements all
five states.

---

## Phase 3 — Money

**Goal:** the business can bill, collect, and reconcile to the rupee.

| Batch | Work | Days |
|---|---|---|
| 3.1 | Invoicing: generation, immutability, credit notes, branded PDF (WeasyPrint) | 3 |
| 3.2 | Payments: COD, UPI-QR-at-door, recording, idempotency, partial payments | 2 |
| 3.3 | **Cash custody**: rider balance, handover, deposit, variance, reconciliation screen | 3 |
| 3.4 | Order cost model: consumable issue on `PACKED`, labour allocation, `OrderCost` rows | 2 |
| 3.5 | Razorpay integration: intent, webhooks, dedupe, refunds *(deferrable — see `09` D-03)* | 3 |
| 3.6 | Customer credit ledger (referral rewards, goodwill, refunds) | 2 |
| 3.7 | Offers engine: first-order, apartment promo, referral credit — dated and rule-based | 2 |

**Exit:** every delivered order has an invoice · daily cash reconciles to ₹0 variance or a
recorded exception · contribution margin computes for a real order · gateway webhooks are
idempotent under replay.

> ### ★ The pilot can start here
> With Phases 0–3 complete, IronMan can run a real pilot: orders entered by ops from WhatsApp,
> garments tracked by scan, riders on the field PWA, invoices issued, cash reconciled. Phases 4–7
> improve the experience and automate the measurement — they do not gate going live. **Starting
> the pilot at this point is strongly recommended: four weeks of real operational data will
> change Phase 4–6 priorities more than any amount of further planning.**

---

## Phase 4 — Customer web & messaging

**Goal:** customers book themselves and are kept informed automatically.

| Batch | Work | Days |
|---|---|---|
| 4.1 | **Tracking page** `/track/{token}` — live status, timeline, ETA, invoice. Ships first: it is cheap, and it is what most pilot customers will ever see | 2 |
| 4.2 | Notification router: WhatsApp + SMS providers, templates, dedupe, delivery log, preferences, non-prod recipient guard | 4 |
| 4.3 | Booking wizard: serviceability → apartment/flat → service → counts → capacity-aware slot → notes → confirm | 4 |
| 4.4 | Customer auth (phone OTP), profile, addresses, order history, invoice download, reorder | 3 |
| 4.5 | Re-quote approval flow (customer side) | 1 |
| 4.6 | Feedback capture after delivery | 1 |
| 4.7 | Marketing/landing page, privacy notice, terms | 2 |
| 4.8 | WhatsApp booking entry point (template → deep link) | 2 |

**Exit:** a first-time customer books from a WhatsApp link on a mid-range Android in under 90
seconds · booking page LCP < 1.8 s on 4G · every lifecycle stage sends the right message on the
right channel exactly once · the tracking page needs no login.

---

## Phase 5 — Growth & attribution

**Goal:** the founders can answer *"who brings us customers and what do they cost?"*

| Batch | Work | Days |
|---|---|---|
| 5.1 | Channels, referral partners (watchmen, influencers), codes, onboarding screens | 2 |
| 5.2 | Attribution capture at first order — immutable, with a fallback "how did you hear about us?" | 2 |
| 5.3 | Commission rules (dated, rule-based), accrual on qualifying orders | 3 |
| 5.4 | Payable balances, settlement runs, payout records, partner statement PDF | 3 |
| 5.5 | Customer referral codes, sharing, reward credit | 2 |
| 5.6 | Campaigns + **marketing spend entry** (the CAC data source) | 2 |
| 5.7 | Lapsed-customer segment + re-engagement campaign send | 2 |

**Exit:** ≥95% of new customers carry an acquisition channel · commission payable reconciles to
accruals exactly · a watchman can be paid from a generated statement · spend is recorded per
channel and apartment.

---

## Phase 6 — Analytics & reporting

**Goal:** the founders' Monday meeting needs no spreadsheet.

| Batch | Work | Days |
|---|---|---|
| 6.1 | Rollup tables + nightly jobs + idempotent backfill | 3 |
| 6.2 | The ten weekly metrics per `07 §2`, with drill-downs | 4 |
| 6.3 | Apartment performance report | 2 |
| 6.4 | Channel performance + CAC | 2 |
| 6.5 | Unit-economics waterfall | 2 |
| 6.6 | Day 30/60/90 checkpoint report | 2 |
| 6.7 | Operations daily dashboard (on-time, WIP ageing, capacity) | 2 |
| 6.8 | Export engine: PDF + Excel + CSV, async, audit-logged | 3 |
| 6.9 | Data-quality checks and alerts (`07 §4.4`) | 2 |

**Exit:** all ten metrics render from live data · **every tile reconciles exactly with its
drill-down** (asserted in tests) · a founder exports the weekly pack to PDF and Excel in one
click · data-quality alerts fire on seeded bad data.

---

## Phase 7 — Hardening, launch & support

| Batch | Work | Days |
|---|---|---|
| 7.1 | Accessibility pass: axe in CI + **manual keyboard/screen-reader pass on the six critical flows** | 4 |
| 7.2 | Performance pass against the budgets in `05 §8` | 3 |
| 7.3 | Empty/error/offline/permission/404 audit across every screen | 2 |
| 7.4 | Security: RBAC matrix tests, IDOR probes, rate limits, headers, manual pen pass | 4 |
| 7.5 | Privacy: consent, retention jobs, data export, **account deletion**, privacy notice | 3 |
| 7.6 | Load test at 3× expected peak; index tuning | 2 |
| 7.7 | Backup + restore rehearsal; runbooks; on-call alerting | 2 |
| 7.8 | UAT with real staff; training material; go-live checklist | 3 |
| 7.9 | Launch + two weeks of hypercare | ongoing |

**Exit:** every `01 §7` success criterion demonstrably met · zero P1 bugs open · restore
rehearsed successfully · staff trained · rollback path documented and tested.

---

## Phase 8 — Customer mobile app (iOS + Android)

Expo + expo-router + NativeWind, reusing `packages/tokens` and `packages/api-client`.
Booking, tracking, history, reorder, payments, referrals, push, profile, deletion. Store
listings, privacy nutrition labels, EAS build pipeline, OTA updates. **~18–22 days.**

**Exit:** feature parity with the customer web surface · push delivered reliably · both stores
approved · crash-free sessions > 99.5%.

## Phase 9 — Field staff mobile app

Expo. Offline-first (not merely offline-capable), native camera barcode scanning, background
sync, push job assignment, native maps hand-off, cash ledger. **~14–18 days.**

**Exit:** a rider completes a full route with no connectivity and syncs cleanly · scan is faster
than the PWA · battery use acceptable over an 8-hour shift.

---

## 3. Effort summary

| Phase | Days | Cumulative |
|---|---:|---:|
| P0 Foundations | 11.5 | 11.5 |
| P1 Backend core | 28 | 39.5 |
| P2 Ops console + Field PWA | 41 | 80.5 |
| P3 Money | 17 | 97.5 |
| **★ Pilot-ready** | | **97.5** |
| P4 Customer web + messaging | 19 | 116.5 |
| P5 Growth | 16 | 132.5 |
| P6 Analytics | 22 | 154.5 |
| P7 Hardening + launch | 23 | 177.5 |
| **v1 complete (web)** | | **~178** |
| P8 Customer app | 20 | 198 |
| P9 Field app | 16 | 214 |

**~178 engineer-days for the web platform; ~214 including both mobile apps.**

For contrast, SRC-B §7 estimated 9–13 weeks (≈45–65 engineer-days) for the same scope. **That
estimate is roughly 3× optimistic** — it omits the fourteen gaps in `00 §4`, the accessibility
and privacy work the brief requires, offline sync, the export engine, and hardening. Being
honest about this now is cheaper than being honest about it in month three.

With two engineers working in parallel (one backend-leaning, one frontend-leaning), the web
platform lands in roughly **13–16 calendar weeks** including review and rework, with the pilot
starting at week 8–9.

## 4. Definition of Done

A batch is done when **all** of these hold — no partial credit:

- [ ] Code merged to `main` and deployed green to staging
- [ ] Unit tests for business logic; service-layer coverage ≥ 85%
- [ ] RBAC assertions for every new endpoint (positive **and** negative cases)
- [ ] All five UI states implemented for every new data view
- [ ] Responsive at 320 / 768 / 1440
- [ ] Keyboard navigable; axe clean; icon-only buttons labelled
- [ ] Loading, error and empty copy written by a human, not a placeholder
- [ ] OpenAPI schema updated; TS client regenerated
- [ ] Audit events written for sensitive actions
- [ ] Sentry breadcrumbs on the new flow
- [ ] Storybook entries for new components
- [ ] Docs in `docs/` updated if a decision changed
- [ ] Demoed to the client or a proxy user

## 5. Risk register

| # | Risk | L | I | Mitigation |
|---|---|:-:|:-:|---|
| R1 | **WhatsApp / DLT approval delays the launch** | H | H | Start in Phase 0. Fall back to SMS-only, then to the tracking link alone. Pilot does not depend on either (`P3` gate). |
| R2 | **Staff do not scan bag tags**; inventory data rots | H | H | Make scanning the *fastest* path, not an extra step. Monitor manual-transition % as a data-quality alert (`07 §4.4`). Train in Phase 7.8. If the rate stays >20%, redesign the workflow — do not add a policy. |
| R3 | **Customers will not install an app** | H | M | Already mitigated by design: booking and tracking are links (`01 §4b`). This is precisely why `00 §3.2 P-1` inverted SRC-B's priority. |
| R4 | **Scope creep from unconfirmed requirements** | H | M | `09-open-decisions.md` closed in Phase 0; anything new goes to a v1.1 list with an explicit trade. |
| R5 | Cash leakage before Phase 3 ships | M | H | Cash custody is in Phase 3, before the pilot. Manual daily reconciliation until then. |
| R6 | Estimate-vs-actual disputes annoy customers | M | M | Threshold-based re-quote (`02 §3.5`) — only material variances interrupt the customer. |
| R7 | Capacity model too rigid or too loose | M | M | Capacity is per cluster per day and editable by ops; tune weekly during the pilot. |
| R8 | Offline sync conflicts corrupt state | M | H | Idempotent ops, server-authoritative resolution, conflicts surfaced not swallowed, dedicated test suite. |
| R9 | Single founder-developer is the bottleneck | H | H | Phase boundaries are clean hand-off points; docs are written for a second engineer to join at any phase. |
| R10 | Pricing changes mid-pilot break historical reporting | M | H | Solved structurally by effective-dated price lists (ADR-005). |
| R11 | Mobile apps slip because component work was assumed shared | M | M | `00 §5 T-1` and `05 §10` budget for building components twice. |
| R12 | Founders stop using the dashboard because a number looks wrong | M | H | Every tile reconciles with its drill-down, asserted in tests (`P6` exit). One unexplained number destroys trust in all ten. |

## 6. What ships in v1.1 (parked, not forgotten)

Packages/subscriptions · advanced cohort and LTV analytics · apartment heat-map ·
in-app support chat · route optimisation · GST/accounting export · sneaker cleaning as a
configured service · multi-hub operations · loyalty beyond referral credit · staff incentive
schemes · customer-facing photo proof gallery.

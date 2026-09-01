# 10 — Quality, Non-Functional Requirements & Observability

## 1. Non-functional requirements

Replaces SRC-B §5's unmeasurable criteria (`00 §3.3 M-9`) with numbers a test can assert.

### 1.1 Performance

| # | Requirement | Target | Measured by |
|---|---|---|---|
| NFR-01 | API read latency | p50 < 120 ms · p95 < 400 ms · p99 < 900 ms | Sentry performance, staging load test |
| NFR-02 | API write latency | p95 < 600 ms | Same |
| NFR-03 | Booking page LCP (4G, mid-range Android) | **< 1.8 s** | Lighthouse CI, field RUM |
| NFR-04 | Console LCP | < 2.5 s | Lighthouse CI |
| NFR-05 | Field PWA LCP | < 2.0 s | Lighthouse CI |
| NFR-06 | INP (all surfaces) | < 200 ms | RUM |
| NFR-07 | CLS | < 0.1 | Lighthouse CI |
| NFR-08 | Scan-to-confirmation | < 500 ms perceived (optimistic UI) | Manual + instrumentation |
| NFR-09 | Dashboard render (rollup-backed) | < 800 ms | Load test |
| NFR-10 | Export generation | < 30 s for 90 days of data | Celery task duration |
| NFR-11 | Capacity headroom | 3× expected peak (300 orders/day) with no target breached | Load test in Phase 7.6 |

### 1.2 Reliability

| # | Requirement | Target |
|---|---|---|
| NFR-12 | API availability (monthly) | 99.5% (≈3.6 h/month) — honest for a single-region managed host at this budget |
| NFR-13 | Booking + tracking availability | 99.9% — the customer-facing path is held to a higher bar than the console |
| NFR-14 | RPO / RTO | RPO ≤ 5 min (PITR) · RTO ≤ 4 h, rehearsed once per phase |
| NFR-15 | Offline field operation | Full shift (8 h) of job updates queued without loss |
| NFR-16 | Notification delivery | ≥ 98% of transactional messages delivered or failed-with-reason within 5 min |
| NFR-17 | Celery task success | ≥ 99.5%; failures alert with the payload preserved for replay |
| NFR-18 | Zero silent data loss | Every rejected write returns an actionable error; nothing is dropped |

### 1.3 Correctness — the ones that actually matter here

| # | Requirement | Verification |
|---|---|---|
| NFR-19 | Money arithmetic is exact | Integer paise everywhere; property-based tests on split/discount/commission rounding |
| NFR-20 | Invoices are reproducible | Regenerating a 6-month-old invoice PDF produces identical figures, after a price change |
| NFR-21 | Commission payable = Σ accruals − Σ settled | Reconciliation test on seeded data + a nightly production check |
| NFR-22 | Cash: Σ collected = Σ handed over + Σ in hand | Nightly check; variance alerts |
| NFR-23 | Stock: opening + receipts − issues ± adjustments = closing | Nightly check |
| NFR-24 | Every dashboard tile reconciles with its drill-down | Automated test per metric (`08` P6 exit) |
| NFR-25 | No order reaches an invalid state | State-machine tests over every transition, valid and invalid |

NFR-24 deserves its place in this list. **The fastest way to lose the founders as users is one
number that does not match its own detail view** — after that they check everything by hand, and
the platform's central purpose is gone.

### 1.4 Usability & accessibility

| # | Requirement | Target |
|---|---|---|
| NFR-26 | WCAG 2.2 AA | axe clean in CI + manual keyboard/SR pass on six critical flows |
| NFR-27 | Booking completion | ≥ 80% of started bookings submitted; median ≤ 90 s |
| NFR-28 | Field job completion | ≤ 3 taps from job card to completed, scan included |
| NFR-29 | Responsive | 320 px → ultrawide, verified at 7 widths |
| NFR-30 | State coverage | Loading, empty, error, offline, permission-denied, 404 on every data view |
| NFR-31 | Copy | Plain English; no raw error codes surfaced; every error names the next action |

### 1.5 Security & privacy

Per `06`. Summary bar: no P1/P2 findings open at launch · every RBAC matrix cell tested · no
secrets in the repo · all PII access audited · retention jobs proven on seeded data.

## 2. Testing strategy

```
                 ┌──────────────────┐
                 │  Manual / UAT    │  real staff, real apartment, Phase 7.8
                 ├──────────────────┤
                 │  E2E (Playwright)│  ~25 specs · the 6 critical flows × 3 roles
                 ├──────────────────┤
                 │  Integration     │  ~250 · DRF API tests per endpoint × role
                 ├──────────────────┤
                 │  Unit            │  ~800 · services, state machines, pricing,
                 │                  │         commission, rollups, offline merge
                 └──────────────────┘
```

**The six critical flows** (E2E on every PR):
1. Customer books from a WhatsApp-style link → tracking page shows the order
2. Ops assigns a route-day → rider picks up with proof → intake verifies with a variance
   re-quote → customer approves
3. Operator scans through pressing → QC fail → rework → pack → dispatch
4. Rider delivers → collects COD → hands cash over → reconciliation closes at ₹0
5. Referred customer's first order → commission accrues → settlement run → partner statement
6. Founder opens the weekly dashboard → drills into an apartment → exports to Excel

Also permanently in the suite:

| Type | What |
|---|---|
| **RBAC** | Parametrised over every cell of `06 §3.1` — positive and negative |
| **IDOR** | Every `{id}` endpoint probed with a wrong-tenant actor |
| **Idempotency** | Every idempotent endpoint called twice; one effect asserted |
| **Offline** | Simulated queue with conflicts, duplicates and out-of-order arrival |
| **Property-based** (Hypothesis) | Money splitting, discounts, commission rounding, capacity allocation |
| **Migration** | Every migration applied to a production-shaped snapshot |
| **Visual regression** | Storybook snapshots on the component library |
| **Load** | Locust: 300 orders/day shape, 3× peak, before launch |

Coverage gates: **85% on `services/` and `selectors/`** (where the business logic lives), 70%
overall. Chasing 100% on serialisers and admin config buys nothing.

## 3. Observability

### 3.1 Errors — `R-807`

Sentry across API, web and mobile. Release tracking with source maps. User context carries the
**user id only — never a phone number or address**. Breadcrumbs on every mutation. Alert rules:
any new issue in production, error rate > 1% over 5 min, any 5xx on the booking or payment path.

### 3.2 Logs

Structured JSON, correlated by `request_id` propagated from the client. Every line carries
`actor_id`, `hub_id` and, where relevant, `order_ref`. **PII is never logged** — phone numbers
and addresses are redacted by a logging filter, not by developer discipline. 30-day retention.

### 3.3 Metrics

Technical: request rate/latency/errors by endpoint · Celery queue depth, task age, failure rate
· DB connections, slow queries, index hit rate · cache hit rate · external provider latency and
error rate.

### 3.4 Business alerts — the ones that matter most

| Alert | Threshold | Goes to |
|---|---|---|
| Order overdue vs its promised slot | > 30 min past slot end | Ops (in-app + WhatsApp) |
| On-time rate today | < 90% | Ops + founder |
| Cash variance | ≠ ₹0 at day close | Ops + founder |
| Rating ≤ 2 received | Immediate | Ops (raises an exception with an SLA) |
| Open claim past SLA | Immediate | Ops manager |
| Stock below reorder level | Daily | Operator |
| Notification delivery failure rate | > 5% over 1 h | Engineering |
| Manual (unscanned) stage transitions | > 20% of transitions | Ops — leading indicator that tagging is being bypassed |
| New customers with null attribution | > 5% | Founder — the metric is degrading |
| Payment webhook failures | Any | Engineering |

**The bottom three exist because a metrics platform degrades silently.** Nothing breaks, no page
errors — the numbers just quietly stop being true. These alerts are what keep the founders'
dashboard trustworthy in month six.

### 3.5 Runbooks

Written in `docs/runbooks/` during Phase 7, one page each: payment webhook backlog · WhatsApp
provider outage · Celery queue backup · database restore · cash variance investigation · lost
garment claim · rider phone lost or stolen · price list rolled back · duplicate customer merge.

Each states: symptom, diagnosis command, fix, and who to tell.

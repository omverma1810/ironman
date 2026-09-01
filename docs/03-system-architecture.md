# 03 — System Architecture

## 1. Guiding constraint

The client's own success criterion is **100–300 active customers and 50–100 orders/day**. That
is roughly **36,000 orders per year** and a peak of perhaps 5 requests/second. A single Postgres
instance handles this without noticing.

**The engineering risk in this project is not scale. It is operational correctness** — cash that
reconciles, garments that are not lost, promises that are kept, attribution that is trustworthy —
**and adoption** — whether a rider and a shop operator actually use the thing at 7 a.m.

Every architectural decision below is made against those two risks. Anything that trades
simplicity for throughput is rejected.

## 2. Topology

```
                                  ┌────────────────────────────┐
   Customer phone browser ───────▶│                            │
   (WhatsApp link, no install)    │   Vercel — Next.js 15      │
                                  │   • /(shop)   customer     │
   Ops desktop / operator tablet ▶│   • /console  admin        │──── SSR/RSC ────┐
                                  │   • /field    staff PWA    │                 │
   Rider phone browser ──────────▶│                            │                 │
                                  └────────────┬───────────────┘                 │
                                               │ HTTPS (JSON, OpenAPI-typed)     │
                                               ▼                                 ▼
  ┌────────────────────────────────────────────────────────────────────────────────┐
  │                     Render / Railway  —  private network                        │
  │                                                                                 │
  │   ┌──────────────────┐   ┌──────────────┐   ┌───────────────┐  ┌─────────────┐ │
  │   │  Django + DRF    │   │ Celery worker│   │ Celery beat   │  │   Redis     │ │
  │   │  gunicorn+uvicorn│──▶│  default/    │   │  schedules    │  │ broker+cache│ │
  │   │  Django Admin    │   │  notify/     │◀──│               │  │ + rate limit│ │
  │   │  /api/v1         │   │  reports q's │   └───────────────┘  └─────────────┘ │
  │   └────────┬─────────┘   └──────┬───────┘                                      │
  │            │                    │                                              │
  │            ▼                    ▼                                              │
  │   ┌──────────────────────────────────────┐    ┌──────────────────────────────┐ │
  │   │        PostgreSQL 17                 │    │  Cloudflare R2 (S3 API)      │ │
  │   │  primary + PITR backups              │    │  proofs · invoices · exports │ │
  │   └──────────────────────────────────────┘    └──────────────────────────────┘ │
  └────────────────────────────────────────────────────────────────────────────────┘
                    │              │              │              │
                    ▼              ▼              ▼              ▼
              Razorpay      WhatsApp BSP     SMS (DLT)        Sentry
              (Phase 3)     Meta Cloud API   provider      errors · traces
                                   │
                                   ▼
                           FCM (push, Phase 8+)
```

Native apps (Phase 8/9) attach to the same `/api/v1` — no separate mobile backend, no BFF. At
this surface size a BFF is pure overhead.

## 3. Backend

### 3.1 Shape

**Modular monolith, Django 5.1 + DRF, Python 3.12.**

```
apps/api/
  config/                 settings/{base,dev,staging,prod}.py, urls, asgi, celery
  common/                 base models, money, enums, pagination, errors, permissions,
                          idempotency, audit mixin, tenancy middleware
  identity/               auth, users, roles, OTP, sessions, audit log
  platform_core/          files, feature flags, config, health, exports
  notifications/          templates, router, providers, delivery log
  territory/              hubs, clusters, apartments, service areas, capacity
  catalog/                services, garment types, price lists, offers, packages
  customers/              customers, addresses, consent, merge
  ordering/               orders, lines, slots, events, exceptions, re-quotes
  custody/                bags, garment lines, stage events, QC, intake
  fulfilment/             route days, jobs, proofs, offline op queue, on-time
  billing/                invoices, payments, credits, cash custody, costs
  supplies/               stock items, movements, consumption rules
  growth/                 channels, partners, codes, commissions, campaigns, feedback
  analytics/              metric definitions, rollup jobs, report builders, exports
```

Each app exposes `services.py` (the public API of that context), `selectors.py` (read queries),
`models.py`, `serializers.py`, `views.py`, `tasks.py`. **Views contain no business logic** —
they validate, call a service, and serialise. Business rules live in services and are testable
without HTTP.

Cross-app rule: `ordering` may call `catalog.services.quote(...)`; it may not
`from catalog.models import PriceLine`. Enforced by an import-linter contract in CI, so the rule
survives contact with a deadline.

### 3.2 State transitions

Every status change goes through a transition function, never a direct attribute assignment:

```python
# ordering/services/transitions.py
@transition(Order, frm={SCHEDULED, PICKUP_FAILED}, to=PICKUP_ASSIGNED, permission="order.assign")
def assign_pickup(order, *, job, actor): ...
```

The decorator validates the source state, takes a row lock, writes the `OrderEvent`, writes the
`AuditEvent` where the action is sensitive, and dispatches notifications after commit
(`transaction.on_commit`). This is how `01 §5`'s state machines stay true in code rather than in
a diagram nobody re-reads.

### 3.3 Background work

Celery with **separate queues so a slow report never delays a delivery SMS**:

| Queue | Concurrency | Work |
|---|---|---|
| `default` | 4 | Post-commit side effects, webhooks, attribution writes |
| `notify` | 4 | WhatsApp / SMS / push / email dispatch, retries with backoff |
| `reports` | 2 | PDF and Excel generation, large exports |
| `rollup` | 1 | Nightly analytics rollups, commission accrual sweeps |

**Beat schedule:** nightly rollups (00:30 IST, after the hub cutoff); hourly overdue-order and
open-claim alerts; daily lapsed-customer sweep; weekly founder digest (Monday 08:00 IST);
daily cash-variance report; hourly stock reorder check.

### 3.4 Idempotency & delivery guarantees

- **Client writes:** `Idempotency-Key` header required on `POST` to order creation, payment
  recording, job completion and offline sync. Stored with the response for 24 h; a repeat
  returns the original response rather than creating a second order.
- **Gateway webhooks:** signature-verified, `GatewayEvent.event_id` unique, processed inside a
  transaction, always `200` after persisting — reconciliation is a separate concern from receipt.
- **Notifications:** `dedupe_key` per (order, event, channel, recipient).
- **Offline queue:** `client_op_id` unique per device; see `02 §3.7`.

### 3.5 Security posture

- TLS everywhere; HSTS; secure, `httpOnly`, `SameSite=Lax` session cookies for the console.
- Argon2id password hashing; OTP codes stored hashed with attempt limits and expiry.
- Rate limits: OTP request 3/phone/10 min, login 10/IP/min, booking 5/phone/hour, general
  authenticated 120/min. Enforced in Redis.
- Object storage is private; all media served through short-lived signed URLs (proof photos are
  pictures of people's front doors — they must never be publicly addressable).
- Secrets in the platform secret store, never in the repo; `django-environ` for config.
- Dependency scanning (`pip-audit`, `npm audit`) and secret scanning in CI.
- Details, including the full RBAC matrix: `06-security-privacy-rbac.md`.

## 4. Frontend hosting & the Vercel question

The brief says "deployed over at Vercel". To be unambiguous (`00 §5 T-2`):

- **Vercel hosts the Next.js web app only** — customer booking, ops console, field PWA.
- **Django, PostgreSQL, Redis and Celery workers cannot run on Vercel.** They run on Render or
  Railway (recommended: Render — managed Postgres with PITR, background workers, private
  networking, predictable pricing at this size).
- Preview deployments on Vercel for every PR, pointed at the staging API.

Architecture detail in `05-frontend-architecture.md`.

## 5. Environments

| Env | Web | API | Data | Purpose |
|---|---|---|---|---|
| **local** | `next dev` | `runserver` + docker-compose (Postgres, Redis, MinIO) | Seeded fixtures | Development |
| **preview** | Vercel per-PR | staging API | staging DB | Review each PR |
| **staging** | `staging.ironman.*` | `api-staging.ironman.*` | Anonymised copy of prod | E2E, UAT, load tests |
| **production** | `ironman.*` | `api.ironman.*` | Prod, PITR backups | Live |

Provider sandboxes (Razorpay test mode, WhatsApp test number, SMS test route) are wired to
local, preview and staging. **No environment other than production may reach a real customer's
phone** — a guard in the notification router blocks non-allowlisted recipients outside prod.
This is a cheap rule that prevents the single most embarrassing class of incident.

## 6. Data lifecycle

| Concern | Approach |
|---|---|
| **Backups** | Managed Postgres daily snapshot + PITR (7 days staging, 30 days prod). **Restore rehearsed once per phase** — an untested backup is a rumour. |
| **Migrations** | Django migrations, forward-only. Expand → migrate → contract for column changes. Zero-downtime not required at this scale, but no destructive migration ships without a backup checkpoint. |
| **Retention** | Proof photos 180 days then deleted (thumbnail retained on claims). Notification payloads 90 days. Audit events 7 years. Financial records 8 years (Indian statutory). |
| **Deletion** | Customer deletion anonymises PII in place and retains financial rows with a tombstoned customer reference. See `06 §6`. |
| **Exports** | Generated to R2 with a 24-hour signed URL; the export request itself is audit-logged (an Excel of every customer's phone number is a data-egress event). |

## 7. Observability

| Signal | Tool | Detail |
|---|---|---|
| Errors | **Sentry** — API, web, mobile | Release tracking, source maps, user context (id only, never phone). Satisfies `R-807`. |
| Logs | Structured JSON to the platform log stream | `request_id`, `actor_id`, `hub_id`, `order_ref` on every line |
| Traces | Sentry performance | DB query and external-call spans on the hot paths |
| Metrics | Django-Prometheus → platform dashboard | Request rate/latency/errors, Celery queue depth and age, task failures |
| Uptime | External check on `/healthz` and the booking page | Alerts to the on-call founder |
| **Business alerts** | In-app + WhatsApp to ops | Orders overdue vs promise, cash variance ≠ 0, WhatsApp delivery failure rate > 5%, stock below reorder, rating ≤ 2 |

The last row matters more than the first four. A platform that is technically up while eleven
orders quietly miss their delivery window has failed the client's number-one KPI.

## 8. CI/CD

```
PR opened
  ├─ lint        ruff · black --check · mypy (api)   |  eslint · prettier · tsc (web)
  ├─ import-linter (bounded-context contracts)
  ├─ test        pytest -n auto (coverage gate: 85% on services/, 70% overall)
  ├─ migrations  makemigrations --check --dry-run   (no drift)
  ├─ security    pip-audit · npm audit · gitleaks
  ├─ a11y        axe-core on key routes (Playwright)
  ├─ build       docker build (api) · next build (web)
  └─ preview     Vercel preview → staging API

merge to main → deploy staging → smoke suite → manual gate → deploy production
```

Rollback: redeploy the previous image (API) or promote the previous deployment (Vercel).
Migrations are forward-only, so a rollback that requires a schema revert is treated as an
incident with a restore path, not a routine action.

## 9. Third-party integrations

| Integration | Phase | Lead time | Notes |
|---|---|---|---|
| **WhatsApp Business API** (Meta Cloud API via a BSP) | 4 | **1–3 weeks** | Business verification + per-template approval. **Start in Phase 0.** ~₹0.11–0.15 per utility message. |
| **SMS** (India) | 4 | **1–2 weeks** | TRAI **DLT** registration of entity, sender header and every template. **Start in Phase 0.** |
| **Razorpay** | 3 | Days | UPI-first, COD complements it. Webhooks idempotent (`§3.4`). |
| **FCM** | 8 | Hours | Push, app users only |
| **Google Maps** | 2 | Hours | Address autocomplete + deep links. **No routing engine** — 3–5 walkable apartments do not need one. |
| **Object storage (R2)** | 1 | Hours | S3-compatible; MinIO locally |
| **Sentry** | 1 | Hours | — |
| **Thermal label printer** | 2 | Days (procurement) | 58 mm Bluetooth/USB, ESC/POS or a browser print sheet. Under ₹3,000. |

**The two lead-time items are the real schedule risk in this project** and neither source
document mentions them. WhatsApp and DLT onboarding cannot be compressed by writing code faster;
they are paperwork with a queue. They start on day one of Phase 0, in parallel.

## 10. What is deliberately not being built

Named explicitly so nobody adds them by reflex:

| Not building | Why |
|---|---|
| Microservices / event bus / Kafka | 5 rps. A monolith with Celery is the correct answer, and the modular boundaries preserve the option. |
| GraphQL | One backend, three known clients, an OpenAPI schema and a generated typed client. REST is less machinery for the same result. |
| Separate BFF per client | Same reason. DRF serialisers per surface are sufficient. |
| Kubernetes | A managed container host does this at a tenth of the operational load. |
| Data warehouse / dbt / ClickHouse | Nightly rollup tables in the same Postgres answer all ten founder metrics in milliseconds. Revisit past ~1M orders. |
| Route optimisation engine | 3–5 apartments inside a walkable radius. An ordered list beats a solver. |
| Real-time websockets everywhere | Polling with a 15 s interval on the two boards that need it (production, route-day). SSE only if the polling proves visibly laggy in the pilot. |
| Custom design system from scratch | shadcn/ui + Tailwind + IronMan tokens gets a better result faster. Effort goes into states and flows, not into re-implementing a dialog. |
| Multi-tenant SaaS | Schema is multi-*hub* ready (`R-804`). That is expansion readiness, not a product for other companies. |

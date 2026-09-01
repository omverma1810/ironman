# IronMan Platform

**Look Good. Feel Good.**

Operations, inventory, billing and growth-analytics platform for IronMan — a doorstep
clothes-pressing service operating apartment cluster by apartment cluster.

> This repository currently contains the **architecture and delivery plan only**.
> No application code has been written yet. Read `docs/` in order before opening an editor.

---

## What this system is actually for

IronMan's founders' plan is not a request for a laundry app. It is a plan to **win one small
geographic cluster, make the service habitual, prove the unit economics, and then repeat the
model in the next cluster.**

Everything the software does — booking, custody tracking, billing, notifications — exists to
serve one output:

> **Trustworthy per-apartment, per-channel unit economics, produced automatically, every week.**

If the platform ships a beautiful booking flow but cannot answer *"does Apartment X make money,
and who brought those customers in?"* — it has failed the client's own document.

That framing drives every decision in `docs/`.

---

## Document index

| # | Document | What it settles |
|---|---|---|
| 00 | [Source Analysis & Traceability](docs/00-source-analysis-and-traceability.md) | Line-by-line mapping of the founders' deck → the draft FRD → this spec. Every gap, every over-reach. |
| 01 | [Product Definition](docs/01-product-definition.md) | Roles, surfaces, corrected MVP scope, the three state machines. |
| 02 | [Domain Model](docs/02-domain-model.md) | Bounded contexts, entities, schema, invariants. |
| 03 | [System Architecture](docs/03-system-architecture.md) | Stack, topology, environments, deployment. |
| 04 | [API Contract](docs/04-api-contract.md) | Endpoint surface, conventions, errors, idempotency, realtime. |
| 05 | [Frontend Architecture](docs/05-frontend-architecture.md) | Three surfaces, design system, the five UI states, icons, a11y. |
| 06 | [Security, Privacy & RBAC](docs/06-security-privacy-rbac.md) | Permission matrix, auth flows, audit log, DPDP compliance, account deletion. |
| 07 | [Analytics & Metrics](docs/07-analytics-and-metrics.md) | The founders' 10 weekly numbers, defined unambiguously, plus rollups and exports. |
| 08 | [Delivery Plan](docs/08-delivery-plan.md) | Phases and batches with hard exit criteria. |
| 09 | [Open Decisions](docs/09-open-decisions.md) | What the client must answer, and what we assumed until they do. |
| 10 | [Quality, NFRs & Observability](docs/10-quality-nfr-observability.md) | Performance budgets, testing strategy, crash reporting, SLOs. |
| — | [Decision Log (ADRs)](docs/adr/0000-decision-log.md) | Every architectural decision with its rejected alternatives. |

## Tech stack (summary — rationale in ADRs)

| Layer | Choice |
|---|---|
| Backend | Django 5 + Django REST Framework, Python 3.12 |
| Database | PostgreSQL 17 |
| Async / jobs | Celery + Redis (beat for schedules) |
| Web frontend | Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui |
| Mobile | Expo (React Native) + TypeScript + NativeWind — Phase 8+ |
| Design system | `@ironman/tokens` — one token source, consumed by web and mobile |
| Payments | Razorpay (UPI-first) + Cash-on-Delivery with cash-custody ledger |
| Messaging | WhatsApp Business API (primary) + SMS fallback + FCM push (app only) |
| Files | S3-compatible object storage (Cloudflare R2) |
| Errors | Sentry (web, mobile, API) |
| Hosting | Web → Vercel · API/DB/Redis/workers → Render or Railway |

## Repository layout (target)

```
apps/
  api/            Django project — modular monolith, one app per bounded context
  web/            Next.js 15 — customer booking, ops console, field PWA
  mobile/         Expo — customer app + field staff app (Phase 8+)
packages/
  tokens/         Design tokens (source of truth for both platforms)
  api-client/     Generated TypeScript client from the OpenAPI schema
docs/             This documentation
infra/            IaC, deployment configuration, CI workflows
```

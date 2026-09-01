# 04 — API Contract

## 1. Conventions

| Aspect | Rule |
|---|---|
| Base | `/api/v1` — version in the path; additive changes only within a version |
| Format | JSON, `snake_case` keys, UTF-8 |
| IDs | UUIDv7 in payloads; human refs (`ORD-2609-0143`) returned alongside and accepted in lookups |
| Money | Always `{"amount_minor": 1500, "currency": "INR"}`. **Never a bare number, never a float, never a formatted string.** |
| Time | RFC 3339 UTC (`2026-09-01T04:30:00Z`). Clients render in `Asia/Kolkata`. |
| Pagination | Cursor-based: `?cursor=&limit=` → `{"results": [], "next": "…", "previous": "…"}`. Offset pagination is offered only on exports. |
| Filtering | Explicit allow-listed query params per endpoint. No generic filter DSL. |
| Sparse fields | `?fields=` on list endpoints for the mobile clients |
| Schema | `drf-spectacular` → OpenAPI 3.1 at `/api/v1/schema/`; TypeScript client generated into `packages/api-client` in CI |
| Auth | `Authorization: Bearer <jwt>` (mobile, customer) **or** session cookie (console). Both accepted; see `06 §2`. |
| Idempotency | `Idempotency-Key: <uuid>` required on the writes listed in `03 §3.4` |
| Tenancy | `hub_id` derived from the actor's role scope server-side. **Never trusted from the client.** |
| Rate limits | `X-RateLimit-*` headers; `429` with `Retry-After` |

## 2. Error format

One shape, everywhere:

```json
{
  "error": {
    "code": "slot_unavailable",
    "message": "That pickup slot is fully booked.",
    "detail": "Tue 2 Sep, 9–11 AM has 0 of 12 pickups remaining for Prestige Lakeside.",
    "field_errors": { "pickup_slot_id": ["Slot is full"] },
    "request_id": "01J8Z9X2Q7",
    "retryable": true
  }
}
```

`message` is safe to surface to a user verbatim — the frontend's error states (`05 §5`) render
it directly, which is why it is written as a sentence a customer can read rather than as a
developer string. `code` is stable and is what clients branch on.

**Codes used across the surface:** `validation_error` · `authentication_required` ·
`permission_denied` · `not_found` · `conflict` · `idempotency_conflict` · `slot_unavailable` ·
`out_of_service_area` · `invalid_state_transition` · `payment_failed` · `duplicate_scan` ·
`stale_offline_op` · `rate_limited` · `provider_unavailable` · `internal_error`.

## 3. Endpoint surface

Grouped by bounded context. `[C]` customer · `[F]` field · `[O]` operator · `[A]` admin/ops ·
`[B]` founder. Permissions per `06 §3`.

### 3.1 Auth & identity

```
POST   /auth/otp/request                  [C][F]  { phone, purpose }
POST   /auth/otp/verify                   [C][F]  → { access, refresh, user }
POST   /auth/login                        [O][A][B]  email + password → session cookie
POST   /auth/logout
POST   /auth/refresh                              rotating refresh + reuse detection
POST   /auth/register                     [C]     phone-first; email optional
POST   /auth/email/verify/request         [O][A][B]
POST   /auth/email/verify/confirm
POST   /auth/password/reset/request               always 200 (no account enumeration)
POST   /auth/password/reset/confirm
POST   /auth/mfa/enroll | /verify         [A][B]  TOTP, optional
GET    /me                                        profile + roles + permissions + hub scope
PATCH  /me
DELETE /me                                [C]     account deletion → 06 §6
```

### 3.2 Territory & serviceability

```
GET    /territory/serviceability?pincode=|lat=&lng=    [C] public → { serviceable, hub, clusters }
GET    /territory/apartments?q=&cluster=              [C] public search, minimal fields
GET    /territory/hubs | /clusters | /apartments      [A]
POST   /territory/apartments                          [A]
PATCH  /territory/apartments/{id}                     [A]
GET    /territory/apartments/{id}/contacts            [A]   watchman/RWA contacts
GET    /territory/capacity?cluster=&from=&to=&kind=   [C] public → slot availability
PATCH  /territory/capacity/{id}                       [A]   adjust a day's capacity
```

### 3.3 Catalog & quoting

```
GET    /catalog/services                              public
GET    /catalog/garment-types?service=                public
GET    /catalog/price-list/active?hub=&service=       public — the CURRENT effective version
POST   /catalog/quote                                 public, no side effects
         { service, apartment, lines:[{garment_type, qty}], referral_code? }
       → { lines[], subtotal, discount, total, price_list_version, offers_applied[] }
GET    /catalog/price-lists                           [B]   version history
POST   /catalog/price-lists                           [B]   creates a DRAFT
POST   /catalog/price-lists/{id}/activate             [B]   sets effective_from; supersedes prior
GET    /catalog/offers | POST | PATCH                 [B]
```

`POST /catalog/quote` is the single source of pricing truth. The booking UI, the counter POS,
the intake re-quote and the invoice all call it — there is no second place where a total is
computed, and therefore no second place where it can be computed differently.

### 3.4 Ordering

```
POST   /orders                                [C][A][O]  Idempotency-Key required
GET    /orders?status=&hub=&apartment=&staff=&channel=&from=&to=&q=&cursor=   [A][O][B]
GET    /orders/{ref}                          [C own][A][O][F assigned]
PATCH  /orders/{ref}                          [A]   slot, address, notes
POST   /orders/{ref}/cancel                   [C own][A]  { reason }
POST   /orders/{ref}/reschedule               [C own][A]  { slot_id, kind }
GET    /orders/{ref}/events                   [A][O]  full timeline
GET    /orders/{ref}/timeline                 [C]     customer-safe subset
POST   /orders/{ref}/requote/respond          [C]     { decision: approve|reject }
POST   /orders/counter                        [O]     walk-in intake (G-7) — creates + tags in one call
GET    /orders/{ref}/exceptions | POST        [A][O]
PATCH  /orders/exceptions/{id}                [A]     assign, resolve, write off

GET    /track/{token}                         public, unauthenticated, rate-limited
         → status, timeline, ETA, invoice link. THE primary customer surface (C-3).
```

`/track/{token}` deserves emphasis: it is the link sent over WhatsApp, and for most pilot
customers it is the *entire* product they ever see. It must be fast, beautiful and require
nothing. The token is high-entropy, scoped to one order and revocable.

### 3.5 Custody & production

```
POST   /custody/bags                          [O]  allocate bag codes for an order → print payload
GET    /custody/bags/{code}                   [O][F]  scan resolution
POST   /custody/scan                          [O][F]  { bag_code, to_stage, station?, device_id }
                                                       Idempotency-Key required
POST   /custody/intake                        [O]  { order, verified_lines[], photos[], notes }
                                                   → may create a ReQuote (M-1)
GET    /custody/board?hub=&stage=&overdue=    [O][A]  production board projection
POST   /custody/qc                            [O]  { garment_line, result, reason? }
POST   /custody/rework                        [O]  { garment_line, reason }
```

`POST /custody/scan` is intentionally one endpoint with a target stage rather than a family of
verbs. The server validates the transition against `01 §5.3` and returns
`invalid_state_transition` with a readable message the operator can act on — a batch scan of 40
bags then reports exactly which two were out of sequence.

### 3.6 Fulfilment

```
GET    /fulfilment/route-days?date=&cluster=          [A]
POST   /fulfilment/route-days                         [A]
POST   /fulfilment/route-days/{id}/assign             [A]  { staff[], jobs[] }
GET    /fulfilment/jobs/mine?date=                    [F]  today's list, offline-cacheable
POST   /fulfilment/jobs/{id}/start                    [F]
POST   /fulfilment/jobs/{id}/arrive                   [F]
POST   /fulfilment/jobs/{id}/complete                 [F]  { declared_lines[], bag_codes[], proof }
POST   /fulfilment/jobs/{id}/fail                     [F]  { reason_code, note, reschedule? }
POST   /fulfilment/proofs                             [F]  multipart or presigned upload
POST   /fulfilment/sync                               [F]  batch offline ops (R-304)
         { ops: [{ client_op_id, op_type, payload, client_ts }] }
       → per-op { client_op_id, status: applied|conflict|rejected, server_state? }
```

`/fulfilment/sync` returns a **per-operation** result rather than a single status. A rider whose
queue contains eight successes and one conflict must be told which one, not handed a red banner.

### 3.7 Billing

```
POST   /billing/invoices/{order}/issue         [A][O]
GET    /billing/invoices?status=&from=&to=     [A][B]
GET    /billing/invoices/{ref}                 [C own][A][B]
GET    /billing/invoices/{ref}/pdf             [C own][A][B]  signed URL
POST   /billing/invoices/{ref}/credit-note     [A]  { reason, amount }
POST   /billing/payments                       [F][O][A]  Idempotency-Key required
         { invoice, method, amount_minor, collected_by? }
POST   /billing/payments/gateway/intent        [C]  Phase 3
POST   /webhooks/razorpay                      public, signature-verified, deduped
GET    /billing/cash/mine                      [F]  running cash-in-hand balance
POST   /billing/cash/handover                  [F]  { to_user, amount_minor }
POST   /billing/cash/handover/{id}/confirm     [A][O]  records variance
GET    /billing/cash/reconciliation?date=      [A][B]
GET    /billing/credits/{customer}             [C own][A]
```

### 3.8 Supplies

```
GET    /supplies/items | POST | PATCH          [O][A]
GET    /supplies/levels?hub=                   [O][A][B]
POST   /supplies/receipts                      [O][A]  { item, qty, unit_cost, supplier }
POST   /supplies/adjustments                   [O][A]  { item, delta, kind, note }
GET    /supplies/movements?item=&from=&to=     [A][B]
GET    /supplies/reorder-alerts                [O][A]
GET    /supplies/consumption-rules | PUT       [A]
```

### 3.9 Growth

```
GET    /growth/partners | POST | PATCH         [A][B]
GET    /growth/partners/{id}/accruals          [A][B]
GET    /growth/partners/{id}/balance           [A][B]
POST   /growth/settlements                     [B]  { partner, period } → creates settlement
POST   /growth/settlements/{id}/mark-paid      [B]  { payment_ref }
GET    /growth/referral-codes | POST           [A][B]
POST   /growth/referral-codes/validate         public — used at booking
GET    /growth/campaigns | POST                [B]
POST   /growth/spend                           [B]  { campaign, amount, date, category }  (G-3)
GET    /growth/attribution/summary?from=&to=   [B]
POST   /growth/feedback                        [C]  { order, rating, comment }
GET    /growth/feedback?rating=&from=          [A][B]
POST   /growth/campaigns/lapsed/send           [A]  re-engagement run (A-06)
```

### 3.10 Analytics & exports

```
GET    /analytics/weekly?week=                 [B]  the 10 founder numbers (07 §2)
GET    /analytics/apartments?from=&to=         [A][B]
GET    /analytics/channels?from=&to=           [A][B]
GET    /analytics/unit-economics?from=&to=     [B]
GET    /analytics/checkpoint?as_of=            [B]  Day 30/60/90 report (A-21)
GET    /analytics/operations?date=             [A][O]  on-time, WIP ageing, capacity use
POST   /exports                                [A][B]  { report, format: pdf|xlsx|csv, params }
                                               → 202 { export_id }   (Celery `reports` queue)
GET    /exports/{id}                                   → status + signed URL when ready
```

Exports are asynchronous by default. A founder pulling a 90-day apartment report should not hold
an HTTP connection open, and an export of customer data is an audit-logged egress event
(`03 §6`), not a page render.

### 3.11 Notifications & platform

```
GET    /notifications/preferences | PATCH      [C]
POST   /notifications/test                     [A]   staging only
GET    /notifications/log?order=               [A]   what was sent, to whom, delivered?
GET    /platform/config                        all   feature flags, enums, public constants
GET    /healthz | /readyz                      public
GET    /audit?object_type=&object_id=          [A][B]
```

`GET /notifications/log?order=` exists because the first support question in this business will
always be *"did the customer actually get the message?"*. Answering it from provider dashboards
is not an answer.

## 4. Realtime

No websockets in v1 (`03 §10`). Two boards poll:

| Surface | Interval | Mechanism |
|---|---|---|
| Production board | 15 s | `GET /custody/board` with `If-None-Match`; `304` on no change |
| Route-day board | 30 s | Same pattern |
| Customer tracking page | 30 s while the tab is visible | Pauses on `visibilitychange` |

ETags make the steady-state cost of polling near zero. If the pilot shows visible lag, SSE on
`/events/stream` is the next step — not websockets, which would need connection state the app
does not otherwise have.

## 5. Versioning & compatibility

- Additive changes only inside `v1`: new optional fields and new endpoints are fine; removing or
  retyping a field is not.
- Mobile clients pin a minimum supported API version and receive a `426 Upgrade Required` with a
  store link when the server drops support — an app on a rider's phone can be six months stale.
- The generated TypeScript client is regenerated in CI; a schema change that breaks the web build
  fails the PR rather than production.

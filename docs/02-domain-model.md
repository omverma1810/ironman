# 02 — Domain Model

## 1. Bounded contexts

The Django project is a **modular monolith**: one deployable, one database, thirteen internal
apps with explicit boundaries. Cross-context reads go through a context's public service layer,
never through another context's models directly. This keeps the option of extraction open
without paying distributed-systems cost at 100 orders/day (ADR-001).

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                                  PLATFORM                                     │
│   identity · notifications · files · audit · config/flags · jobs              │
└───────────────────────────────────────────────────────────────────────────────┘
        │                    │                    │                   │
┌───────▼────────┐  ┌────────▼────────┐  ┌────────▼───────┐  ┌───────▼────────┐
│   TERRITORY    │  │     CATALOG     │  │    ORDERING    │  │    CUSTODY     │
│ hub · cluster  │  │ service · gtype │  │ order · line   │  │ bag · gline    │
│ apartment      │  │ pricelist(dated)│  │ slot · capacity│  │ stage events   │
│ serviceability │  │ offer · package │  │ exception      │  │ QC · rework    │
└───────┬────────┘  └────────┬────────┘  └────────┬───────┘  └───────┬────────┘
        │                    │                    │                   │
┌───────▼────────┐  ┌────────▼────────┐  ┌────────▼───────┐  ┌───────▼────────┐
│   CUSTOMERS    │  │     BILLING     │  │  FULFILMENT    │  │   SUPPLIES     │
│ customer       │  │ invoice·payment │  │ routeday · job │  │ stockitem      │
│ address        │  │ cashcustody     │  │ proof·attempt  │  │ receipt·issue  │
│ consent        │  │ credit·refund   │  │ on-time calc   │  │ reorder        │
└───────┬────────┘  └────────┬────────┘  └────────┬───────┘  └───────┬────────┘
        │                    │                    │                   │
┌───────▼────────────────────▼────────────────────▼───────────────────▼────────┐
│                                  GROWTH                                       │
│  channel · referral partner · referral code · attribution · commission        │
│  accrual · settlement · campaign · spend · feedback                           │
└───────────────────────────────────────────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼────────────────────────────────────────┐
│                    ANALYTICS (read-only projections & rollups)                │
└───────────────────────────────────────────────────────────────────────────────┘
```

Django app names: `identity`, `platform_core`, `notifications`, `territory`, `catalog`,
`customers`, `ordering`, `custody`, `fulfilment`, `billing`, `supplies`, `growth`, `analytics`.

## 2. Cross-cutting conventions

| Convention | Rule | Why |
|---|---|---|
| **Primary keys** | UUIDv7 on all domain tables | Non-guessable in URLs, mergeable across environments, time-ordered for index locality |
| **Human references** | Separate short code per entity: `ORD-2609-0143`, `INV-2609-0087`, `BAG-8F3K2Q` | Nobody reads a UUID over the phone |
| **Money** | `BIGINT` minor units (paise) + `currency` char(3). **Never float, never implicit rupees.** | Rounding on a ₹15 shirt × commission % is exactly where money disappears (ADR-004) |
| **Time** | `timestamptz`, stored UTC, rendered `Asia/Kolkata`. Business days close at a configured hub cutoff, not midnight UTC | Daily rollups will be wrong otherwise |
| **Tenancy** | Every operational row carries `hub_id` | `R-804`; retrofitting later is a migration under load (ADR-013) |
| **Deletion** | No hard deletes on domain rows. `deleted_at` + `deleted_by`. Customer deletion = anonymise PII, retain financial rows | `R-806`, DPDP + statutory retention |
| **Auditing** | `created_at/by`, `updated_at/by` on every table; plus append-only `AuditEvent` for sensitive actions | `R-802` |
| **Immutability** | Invoices, commission accruals, stage events, payments and audit events are **append-only**. Corrections are new rows (credit note, reversal), never updates | Reproducibility of history (`A-20`) |
| **Enums** | `TextChoices` in Python, stored as short varchar with a DB `CHECK` | Readable in `psql`, safe to extend |

## 3. Core entities

### 3.1 Identity & access (`identity`)

```
User                 id, email?, phone?, full_name, is_active, password?, 
                     email_verified_at, phone_verified_at, last_login_at, mfa_secret?
Role                 code (ADMIN|OPS|OPERATOR|FIELD|FOUNDER|VIEWER|CUSTOMER), name
UserRole             user, role, hub?           # hub-scoped role assignment
StaffProfile         user, employee_code, hub, joined_at, is_field_staff, vehicle?
Session/RefreshToken standard; refresh rotation + reuse detection
OtpChallenge         phone, purpose, code_hash, attempts, expires_at, consumed_at
AuditEvent           actor, actor_role, action, object_type, object_id, hub,
                     before(jsonb), after(jsonb), ip, user_agent, created_at   [APPEND-ONLY]
```

A user may hold several roles, optionally scoped to a hub — the pattern the operation actually
needs when a founder is also the ops manager (`01 §3`).

### 3.2 Territory (`territory`)

```
Hub                  code, name, address, geo, timezone, cutoff_time, is_active
Cluster              hub, name, notes, is_active            # a route-able group of apartments
Apartment            cluster, name, address, pincode, geo, gate_notes,
                     is_active, launched_on                 # first-class analytics dimension
ApartmentContact     apartment, kind(WATCHMAN|MANAGER|RWA), name, phone, notes
ServiceArea          hub, pincode[], apartment[]            # serviceability check at booking
RouteDayCapacity     hub, cluster, date, slot, pickup_capacity, delivery_capacity, booked_count
```

`Apartment.launched_on` is what makes the founders' "which apartments are working" question
answerable fairly — a cluster live for 5 days should not be compared to one live for 60.

### 3.3 Catalog & pricing (`catalog`)

```
Service              code(IRONING|SNEAKER_CLEAN|...), name, unit(PER_ITEM|PER_KG|PER_PAIR),
                     is_active, sla_hours                    # R-805: extensible, not hardcoded
GarmentType          service, code(SHIRT|TROUSER|SAREE|...), name, default_press_seconds
PriceList            hub, service, version, effective_from, effective_to?, status(DRAFT|ACTIVE|
                     SUPERSEDED), created_by, notes          # EFFECTIVE-DATED, never mutated
PriceLine            price_list, garment_type, unit_price_minor, min_qty?
Offer                code, kind(FIRST_ORDER|REFERRAL_CREDIT|APARTMENT_PROMO|FLAT|PERCENT),
                     value, cap_minor?, effective_from, effective_to?, conditions(jsonb),
                     max_redemptions?, is_active
Package              service, name, cycle(WEEKLY|MONTHLY), included_qty, price_minor,
                     effective_from, ...                     # modelled now, no UI in v1 (C-12)
```

**Invariant (`M-5`, `A-20`):** a `PriceList` in `ACTIVE` or `SUPERSEDED` status is immutable.
Changing a price creates a new version with a new `effective_from`. Every order stores a
`price_list_version` and denormalised unit prices at intake, so an invoice printed a year later
still reproduces exactly.

### 3.4 Customers (`customers`)

```
Customer             user?, phone (unique per hub), name, email?, preferred_language,
                     default_address, hub, status(LEAD|ACTIVE|LAPSED|BLOCKED),
                     first_order_at, last_order_at, lifetime_orders, lifetime_gross_minor,
                     acquisition_channel, acquisition_apartment, acquisition_partner  [IMMUTABLE]
Address              customer, apartment?, flat_no, block?, landmark, geo, label, is_default,
                     free_text_address?                       # non-apartment / walk-in fallback
ConsentRecord        customer, purpose(SERVICE|MARKETING|WHATSAPP), granted, source, at, ip
CustomerNote         customer, author, body, is_internal
CustomerMergeLog     surviving_id, merged_id, merged_by, at, payload(jsonb)
```

`acquisition_*` fields are **write-once at first order** (`R-502`, `A-03`). Attribution that can
be edited later is attribution nobody believes.

### 3.5 Ordering (`ordering`)

```
Order                ref, hub, customer, address, apartment, service, channel(WEB|WHATSAPP|
                     COUNTER|PHONE|APP), status, 
                     pickup_slot_start/end, delivery_slot_start/end,        # THE PROMISE
                     pickup_promised_at, delivery_promised_at,              # for on-time calc
                     picked_up_at, delivered_at,
                     declared_total_qty, verified_total_qty,
                     price_list_version, estimate_minor, subtotal_minor, discount_minor,
                     tax_minor, total_minor,
                     referral_code?, offer_applied?, notes, special_instructions,
                     cancelled_by?, cancelled_reason?, cancelled_at?
OrderLine            order, garment_type, declared_qty, verified_qty,
                     unit_price_minor, line_total_minor, notes    # unit price SNAPSHOT
OrderEvent           order, event_type, from_status, to_status, actor, actor_role,
                     payload(jsonb), occurred_at                  [APPEND-ONLY timeline]
OrderException       order, garment_line?, kind(DAMAGED|LOST|MISSING|WRONG_ITEM|REPRESS|
                     COMPLAINT), severity, description, photos, raised_by, assigned_to,
                     sla_due_at, status(OPEN|INVESTIGATING|RESOLVED|WRITTEN_OFF),
                     resolution, cost_minor, resolved_at         # G-6
ReQuote              order, reason, old_total_minor, new_total_minor, sent_at,
                     approved_at?, rejected_at?, channel        # M-1: the count-variance flow
Slot                 hub, cluster, date, window(start,end), kind(PICKUP|DELIVERY), capacity, booked
```

**Invariants**
- `declared_total_qty` is set at booking/pickup and never changed after `INTAKE_VERIFIED`.
- `verified_total_qty` is set once, at intake, by scan+count. Amending it after invoicing
  requires a credit note.
- Billing derives from `verified_qty` only (`M-1`).
- If `|verified − declared|` exceeds the configured threshold (default: 2 items **or** 15% of
  declared value, whichever is greater), a `ReQuote` is raised and the order goes `ON_HOLD`
  until approved. Below the threshold, the customer is notified but production continues —
  a re-approval loop on every single-shirt discrepancy would stall the shop.

### 3.6 Custody (`custody`)

```
Bag                  code (QR payload), order, hub, garment_count, printed_at, current_stage
GarmentLine          order_line, bag, seq, garment_type, stage, condition_notes,
                     defect_flags[], is_rework, rework_count
StageEvent           bag?, garment_line?, from_stage, to_stage, actor, hub, station?,
                     scanned(bool), occurred_at, device_id                [APPEND-ONLY]
QcCheck              garment_line, result(PASS|FAIL), reason?, checked_by, at
IntakeVerification   order, operator, declared_qty, verified_qty, variance,
                     photos[], notes, at
```

`Bag.code` is the QR payload — a short opaque code, not a URL containing customer data. Scanning
resolves it server-side. **A stage transition without a scan is possible but is flagged**
(`StageEvent.scanned = false`) and surfaces in a data-quality report; a shop where 40% of
transitions are manual is a shop where the inventory numbers are decorative.

### 3.7 Fulfilment (`fulfilment`)

```
RouteDay             hub, cluster, date, assigned_staff[], status(PLANNED|ACTIVE|CLOSED)
Job                  route_day, order, kind(PICKUP|DELIVERY), sequence, assigned_to,
                     status(PENDING|EN_ROUTE|ARRIVED|DONE|FAILED), slot_start, slot_end,
                     started_at, arrived_at, completed_at, attempt_no
JobAttempt           job, attempt_no, outcome, failure_reason, notes, at
Proof                job, kind(PHOTO|OTP|SIGNATURE), file?, otp_verified, geo?, at
OfflineOp            device_id, staff, client_op_id (unique), op_type, payload(jsonb),
                     client_ts, server_received_at, status(PENDING|APPLIED|CONFLICT|REJECTED)
```

`OfflineOp.client_op_id` is the idempotency key for `R-304`: the field app can replay its queue
freely, and the server applies each operation exactly once. Conflicts (e.g. ops cancelled the
order while the rider was offline) are surfaced to the rider rather than silently dropped.

### 3.8 Billing (`billing`)

```
TaxSettings          hub (unique), gst_enabled(bool), gstin?, default_rate_bps,
                     updated_by, updated_at        # D-04: admin-configurable, per hub
Invoice              ref, order, customer, hub, issued_at, subtotal_minor, discount_minor,
                     tax_minor, gst_applied(bool), gstin_snapshot?, total_minor,
                     status(DRAFT|ISSUED|PAID|CANCELLED),
                     pdf_file, price_list_version, snapshot(jsonb)        [IMMUTABLE once ISSUED]
CreditNote           invoice, reason, amount_minor, issued_by, at, pdf_file
Payment              invoice, method(CASH|UPI_QR|GATEWAY|CREDIT|ADJUSTMENT), amount_minor,
                     status, gateway_ref?, idempotency_key (unique), collected_by?, at
GatewayEvent         provider, event_id (unique), payload(jsonb), processed_at   # webhook dedupe
CustomerCredit       customer, balance_minor          # derived; never written directly
CreditEntry          customer, delta_minor, reason(REFERRAL|GOODWILL|REFUND|SPEND|EXPIRY),
                     order?, created_by, at                                [APPEND-ONLY LEDGER]
CashCustody          staff, hub, date, opening_minor, collected_minor, handed_over_minor,
                     closing_minor, status(OPEN|RECONCILED|VARIANCE)
CashHandover         from_staff, to_user, amount_minor, at, note, variance_minor, approved_by
OrderCost            order, kind(CONSUMABLE|LABOUR|COMMISSION|DELIVERY|OTHER),
                     amount_minor, source_ref                       # feeds contribution margin
```

`CustomerCredit.balance_minor` is a materialised sum of `CreditEntry`. Resolving `M-8`: referral
rewards are a **proper append-only ledger**, because "simple credit" that can be earned, partly
spent and refunded is a ledger whether you call it one or not. It is small — one table and a
sum — but it must be built as a ledger, not as an integer field somebody decrements.

### 3.9 Supplies (`supplies`) — the missing inventory (`G-2`)

```
StockItem            hub, sku, name, unit(PIECE|LITRE|KG|ROLL), category(HANGER|COVER|BAG|
                     CHEMICAL|SPARE|OTHER), reorder_level, is_active
StockBatch           stock_item, qty_received, unit_cost_minor, received_on, supplier, invoice_ref
StockLevel           stock_item, hub, qty_on_hand, avg_unit_cost_minor      # derived
StockMovement        stock_item, hub, delta_qty, kind(RECEIPT|ISSUE|ADJUSTMENT|WASTAGE|RETURN),
                     order?, unit_cost_minor, actor, note, at            [APPEND-ONLY]
ConsumptionRule      service, garment_type?, stock_item, qty_per_unit
                     # e.g. 1 hanger + 1 poly cover per shirt → auto-issue on PACKED
UtilityReading       hub, kind(POWER|GAS|WATER), reading, cost_minor, period_start, period_end
```

`ConsumptionRule` is what turns the client's *"are we making enough after our costs?"* (`A-17`)
into a number. On `PACKED`, the system issues stock per rule and writes an `OrderCost` row of
kind `CONSUMABLE`. Manual adjustment stays available for the operator, but the default path
requires no data entry.

### 3.10 Growth & attribution (`growth`)

```
Channel              code(WATCHMAN|CUSTOMER_REFERRAL|INFLUENCER|FLYER|DIGITAL_AD|WALK_IN|
                     ORGANIC|WHATSAPP), name, is_paid
ReferralPartner      kind(WATCHMAN|INFLUENCER|OTHER), name, phone, apartment?, upi_id?,
                     commission_rule, status, onboarded_by, notes
ReferralCode         code (unique, human-sayable), owner_partner? | owner_customer?,
                     apartment?, is_active, uses_count
CommissionRule       name, basis(PER_ORDER|PER_ITEM|PERCENT_OF_ORDER|FLAT_FIRST_ORDER),
                     value_minor_or_pct, applies_to(FIRST_ORDER_ONLY|ALL_ORDERS|
                     FIRST_N_ORDERS), n?, cap_minor?, effective_from, effective_to?
                     # A-04: "₹3 of a ₹15 shirt" — but first-order-only vs every-order is a
                     #       5× swing in unit economics. Rule-based, dated, testable.
CommissionAccrual    partner, order, rule_version, amount_minor, status(ACCRUED|APPROVED|
                     SETTLED|VOID), accrued_at                              [APPEND-ONLY]
Settlement           partner, period_start, period_end, total_minor, status, paid_at,
                     payment_ref, approved_by
Attribution          customer, order?, channel, apartment, partner?, referral_code?,
                     is_first_touch, captured_at                            [APPEND-ONLY]
Campaign             name, channel, apartment?, cluster?, start_on, end_on, objective
Spend                campaign, amount_minor, spent_on, category(INFLUENCER|PRINT|ADS|
                     INCENTIVE|OTHER), note, entered_by             # G-3: the CAC data source
Feedback             order, customer, rating(1-5), comment?, tags[], is_public,
                     responded_by?, responded_at?
```

### 3.11 Notifications (`notifications`)

```
NotificationTemplate code, channel(WHATSAPP|SMS|PUSH|EMAIL), locale, provider_template_id?,
                     body, variables[], approval_status   # WhatsApp/DLT approval tracked here
NotificationRequest  recipient_kind, recipient_id, template, channel, payload(jsonb),
                     dedupe_key (unique), scheduled_for, status
NotificationDelivery request, provider, provider_message_id, status(QUEUED|SENT|DELIVERED|
                     READ|FAILED), error?, cost_minor, at
NotificationPref     customer|user, channel, opted_in, updated_at
```

A **channel router** picks the best available channel per recipient: WhatsApp if opted in and a
template is approved → SMS fallback → push if the app is installed → email for invoices. One
call site (`notify(event, order)`), one place to change policy. `dedupe_key` prevents the classic
"customer got the delivery message four times because Celery retried".

## 4. Key relationships

```
Hub 1─* Cluster 1─* Apartment 1─* Address *─1 Customer 1─* Order
Order 1─* OrderLine 1─* GarmentLine *─1 Bag
Order 1─1 Invoice 1─* Payment
Order 1─* Job (PICKUP, DELIVERY) *─1 RouteDay
Order 1─* OrderCost   ← StockMovement (CONSUMABLE) + CommissionAccrual (COMMISSION)
Customer 1─1 Attribution(first_touch) *─1 Channel, Apartment, ReferralPartner
ReferralPartner 1─* CommissionAccrual *─1 Settlement
```

## 5. Invariants worth enforcing in the database

Application-level checks get bypassed. These belong in constraints and triggers:

1. `Invoice.status = ISSUED` ⟹ row immutable (trigger blocking `UPDATE` of money columns).
2. `PriceList.status IN (ACTIVE, SUPERSEDED)` ⟹ `PriceLine` rows immutable.
3. Exclusion constraint: at most one `ACTIVE` `PriceList` per `(hub, service)` at any instant
   (`tstzrange` `EXCLUDE` on `effective_from/effective_to`).
4. `Order.status = CLOSED` ⟹ payment status `PAID` or `WRITTEN_OFF` **and** no open exception.
5. `RouteDayCapacity.booked_count <= pickup_capacity` (`CHECK`), with the booking write taking
   a `SELECT … FOR UPDATE` on the capacity row — otherwise two customers take the last slot.
6. `Payment.idempotency_key`, `GatewayEvent.event_id`, `OfflineOp.client_op_id`,
   `NotificationRequest.dedupe_key` — all `UNIQUE`.
7. `CommissionAccrual` unique on `(partner, order, rule_version)` — a partner is paid once per
   order per rule.
8. `Customer.phone` unique per hub, normalised to E.164 before write.
9. Append-only tables (`AuditEvent`, `StageEvent`, `OrderEvent`, `CreditEntry`,
   `StockMovement`, `Attribution`, `CommissionAccrual`) — `REVOKE UPDATE, DELETE` from the
   application role.

## 6. Indexing plan (initial)

| Table | Index | Serves |
|---|---|---|
| `Order` | `(hub, status, pickup_slot_start)` | Ops list, route planning |
| `Order` | `(apartment_id, created_at DESC)` | Apartment reports (`A-10`) |
| `Order` | `(customer_id, created_at DESC)` | Order history, repeat detection |
| `Order` | partial `(hub) WHERE status NOT IN (CLOSED, CANCELLED)` | The console's default working set |
| `StageEvent` | `(bag_id, occurred_at DESC)` | Timeline, production board |
| `GarmentLine` | `(stage, hub)` | WIP board counts |
| `Job` | `(assigned_to, slot_start)` | Field job list |
| `Payment` | `(invoice_id)`, unique `(idempotency_key)` | Settlement |
| `CommissionAccrual` | `(partner_id, status)` | Payable balance |
| `Attribution` | `(channel_id, captured_at)`, `(apartment_id, captured_at)` | CAC, apartment analytics |
| `AuditEvent` | `(object_type, object_id, created_at DESC)` | Audit viewer |

At this data volume (≈36k orders/year) Postgres will not struggle. These exist so that the
console's list views stay under budget from day one rather than after the first complaint.

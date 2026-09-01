# 00 — Source Analysis & Requirements Traceability

Two source documents were supplied:

| ID | Document | Author | Status |
|---|---|---|---|
| **SRC-A** | *IRON MAN — Founders' Office: 30/60/90 Day Business & Marketing Plan* (7 pp.) | Client (founders) | Authoritative statement of intent |
| **SRC-B** | *IronMan — MVP Feature Requirements Document v1.0* (7 pp.) | Prepared by us, drafted with an LLM | Draft, unverified |

This document establishes what SRC-A actually requires, audits SRC-B against it, and produces
the corrected requirement set (`R-###`) that the rest of `docs/` builds on.

---

## 1. The framing error to fix first

**SRC-A is a go-to-market plan. It never asks for software.** It mentions technology exactly
twice — "ideally through WhatsApp or a simple booking link" and "our automated process"
(the pressing machine, i.e. hardware).

SRC-B reads SRC-A as if it were a product brief and produces a 30-item feature list for a
generic laundry SaaS. That is not wrong to want — the client has separately commissioned an
inventory / billing / sales platform — but it means **large parts of SRC-B are extrapolation
presented as client requirements.** Two consequences:

1. Features SRC-B calls "Must-Have" that SRC-A never implies get equal weight to features
   SRC-A states outright. Priorities are therefore unreliable.
2. Requirements SRC-A states *plainly* are missing from SRC-B entirely (see §4).

The corrective lens applied throughout: **SRC-A describes a business that runs on learning
loops.** Prices, referral commissions, discounts and influencer spend are explicitly declared
variable — *"Pricing, watchman/referral commission, discounts and influencer spending should
all be tested. They are not fixed numbers in this plan."* The platform's job is to make those
experiments cheap to run and their results legible. That is a **configurability and
measurement** requirement, and it is the single most under-served theme in SRC-B.

---

## 2. What SRC-A actually requires of software

Every software-relevant statement in the founders' deck, extracted verbatim-in-substance:

| Ref | SRC-A statement (p.) | Software requirement it creates |
|---|---|---|
| A-01 | "Make it very easy for someone to book us, **ideally through WhatsApp or a simple booking link**" (p.3) | Zero-friction booking with **no app install**. WhatsApp is named *first*. |
| A-02 | "Customers book us, we pick up the clothes, press them … and deliver them back" (p.1) | Four-stage order lifecycle: Book → Pick Up → Press → Deliver. |
| A-03 | "**Track which apartment and which referral partner brings each customer**" (p.3) | First-touch attribution: apartment + referral partner, captured per customer, immutable. |
| A-04 | "if a shirt costs ₹15, we could test ₹3 for a successful referral and keep ₹12 **before our other costs**" (p.3) | Per-unit pricing, per-referral commission accrual, **and a cost model** — "other costs" must be captured to compute margin. |
| A-05 | "**Track who has ordered and who has come back**" (p.4) | Repeat-customer identification with an explicit definition of "come back". |
| A-06 | "Send simple follow-ups to customers who tried IronMan but **have not ordered again**" (p.4) | Lapsed-customer segment + outbound re-engagement messaging. |
| A-07 | "Later, test weekly or monthly **packages**" (p.4) | Subscription/package model — deferrable, but the pricing engine must not preclude it. |
| A-08 | "Give customers a **simple referral offer** if the numbers make sense" (p.4) | Customer-to-customer referral with a reward, configurable, switchable off. |
| A-09 | "**See which source brings better customers**: watchmen, referrals, influencers, flyers or digital marketing" (p.4) | Channel taxonomy + per-channel cohort quality, not just volume. |
| A-10 | "**Track customers and orders apartment by apartment**" (p.4) | Apartment is a first-class dimension on every operational and financial fact. |
| A-11 | "Keep customers close together so pickup and delivery stay **efficient**" (p.4) | Route/cluster density is an operational objective → capacity and routing are in scope. |
| A-12 | "Move into nearby apartments that **fit our pickup and delivery route**" (p.5) | Cluster/route as a managed entity; expansion is a data-driven decision. |
| A-13 | "Make every order feel professional **from booking to delivery**" (p.5) | Consistent, branded customer communication at each stage. |
| A-14 | "One possible next service is **sneaker cleaning** … New services should make sense for the same customer and delivery network" (p.5) | **Service catalogue must be extensible.** Do not hardcode "ironing". |
| A-15 | Weekly numbers table (p.6) — 10 named metrics | The founder dashboard. Each metric needs a precise, agreed definition. |
| A-16 | "**Cost to Get a Customer** — how much are we spending to get each new customer?" (p.6) | **Marketing spend must be recorded in the system**, by channel and apartment. Nothing else can produce CAC. |
| A-17 | "**Money Made per Order** — are we making enough after our costs?" (p.6) | Contribution margin per order → requires consumables, labour and commission costs per order. |
| A-18 | "**On-time Pickup / Delivery** — are we keeping our promise?" (p.6) | A *promise* must be recorded (a committed slot) before on-time can be measured against it. |
| A-19 | "**Customer Feedback** — are customers happy?" (p.6) | Post-delivery rating + free text, aggregated. |
| A-20 | "Pricing, watchman/referral commission, discounts and influencer spending should all be **tested**. They are **not fixed numbers**." (p.6) | **Effective-dated, versioned configuration** for price lists, commission rules and offers. Historical records must remain reproducible after a change. |
| A-21 | Day 30 / 60 / 90 checkpoints (p.7) | Point-in-time reporting: the system must answer these questions *as of* a date. |
| A-22 | "Speak with **permanent watchmen/security guards**" · "watchmen contacts" | Referral partners are a managed entity with contacts, codes and money owed to them. |
| A-23 | "**Repeat this model in the next apartment cluster** … next neighborhood" (p.7) | Design for multiple hubs/clusters from day one at the schema level. |
| A-24 | "Make sure clothes are pressed properly and **handled carefully**" (p.3) | Garment custody, damage/loss handling and QC are business-critical, not nice-to-have. |
| A-25 | "**Make sure pickup happens when promised**" (p.3) | Committed time slots, and therefore **finite capacity per slot**. |

---

## 3. Audit of SRC-B (the draft FRD)

### 3.1 What SRC-B gets right

Genuinely correct and worth keeping:

- The five-role model (Customer, Field Staff, Store Operator, Admin/Ops, Founder) is a sound
  reading of the operation.
- §3.4 correctly lifts the founders' 10 weekly metrics verbatim and makes them a first-class
  dashboard requirement. That is the most valuable page in the document.
- §4 "Out of Scope" is disciplined and mostly right — deferring GST integration, IoT machine
  integration, multi-city and dynamic pricing is correct for this stage.
- The stack recommendation (Django + DRF + Postgres + Next.js + Expo) is appropriate. See §5
  for the corrections it needs.
- Success criterion "System remains usable with 100–300 active customers and 50–100 daily
  orders" is honest about scale — and it is the strongest argument in either document *against*
  over-engineering.

### 3.2 Priority inversions — where SRC-B contradicts the client

| # | SRC-B says | SRC-A says | Verdict |
|---|---|---|---|
| **P-1** | A13 **WhatsApp Integration — Nice-to-Have** | "Make it very easy … **ideally through WhatsApp** or a simple booking link" (p.3) | **Wrong, and it is the most consequential error in the document.** For 100 first-time customers in Indian apartment blocks, requiring an app install is the largest single adoption risk in the plan. SRC-B makes native apps Must-Have and the client's own first-named channel optional. **Corrected: WhatsApp + a no-install booking link are Must-Have; native apps are a retention tool, not the acquisition path.** |
| **P-2** | F6 **Offline Mode — Nice-to-Have** | "Make sure pickup happens when promised" (p.3); on-time % is a weekly KPI (p.6) | Field staff update status at apartment doors, in lifts and in basements. If the write fails, the on-time metric is silently corrupted — the KPI the founders check weekly. **Corrected: an offline write queue is Must-Have for the field surface.** |
| **P-3** | C9 **Packages — Nice-to-Have** | "Later, test weekly or monthly packages" (p.4) | Correctly deferred as a *feature*, but SRC-B does not require the pricing engine to be capable of it. Deferring the UI is fine; painting the data model into a corner is not. **Corrected: defer the feature, require the model to support it.** |
| **P-4** | A14 **Advanced Analytics (CAC by channel) — Nice-to-Have** | "Cost to Get a Customer" is one of the 10 weekly numbers (p.6) | SRC-B simultaneously puts CAC on the Must-Have founder dashboard (§3.4) and in Nice-to-Have advanced analytics (A14). **Internal contradiction.** CAC is Must-Have — and it is unbuildable without the missing spend module (§4, G-3). |

### 3.3 Modelling errors in SRC-B

| # | Issue | Why it breaks |
|---|---|---|
| **M-1** | **C1 captures "garment count / type" at booking and treats it as final.** | It never is. The customer says 12 shirts; the staff member counts 10 and finds 2 trousers. SRC-B has no reconciliation step, so the invoice is built on a guess. **Every order needs a declared estimate (booking) and a verified actual (intake), with the invoice derived from the actual and the customer notified of any change.** This is a structural omission, not a detail. |
| **M-2** | **C2's status list is a single linear chain** (Booked → Picked Up → At Store → Pressing → Ready → Out for Delivery → Delivered). | Real operations are not linear. Missing: Scheduled/Assigned, Pickup Failed, Customer Not Available, Rescheduled, Partially Ready, Delivery Attempt 2, Returned to Hub, On Hold, Cancelled-by-whom. |
| **M-3** | **Order status, payment status and garment status are conflated into one chain.** | They advance independently — an order can be Delivered and Unpaid (COD not collected), or Ready with two garments held for rework. **Three separate state machines are required** (see `01-product-definition.md` §5). |
| **M-4** | **A2 "Garment Inventory Tracking" is specified as "simple item count + notes per order".** | A count in a text box is not tracking. With 50–100 orders/day × ~10 garments = **500–1,000 garments/day** in one small shop, physical identification is mandatory or the system is abandoned inside three weeks. **See G-1.** |
| **M-5** | **A8 "Pricing & Offers — configurable price list"** with no versioning. | SRC-A (A-20) guarantees prices will change during the pilot. Mutating a price row makes every historical invoice unreproducible and every margin trend meaningless. **Price lists must be effective-dated and orders must snapshot their pricing.** |
| **M-6** | **A11 RBAC is one sentence**, listing four roles that do not match the five personas in §2. | Roles in §2: Customer, Field Staff, Store Operator, Admin/Ops, Founder. Roles in A11: Admin, Operations, Store Operator, Viewer. They are different lists. RBAC needs an explicit permission matrix with **object-level scoping** (a field staff member sees only their own jobs; a store operator must not see pricing or commissions). |
| **M-7** | **No audit log anywhere in the document.** | The system handles money, commissions payable to third parties, and cash collected by field staff. Price changes, order cancellations, refunds, commission settlements and customer deletions must be attributable and immutable. |
| **M-8** | **§4 excludes "loyalty points beyond simple referral credit" but A8 includes "referral credits".** | A credit balance *is* a ledger — it can be earned, spent, partially spent, expired and refunded. Calling it "simple" does not remove the double-entry problem. Either build a credit ledger properly or pay referrals as a discount on a single order. **Contradiction to resolve — see `09-open-decisions.md` D-06.** |
| **M-9** | **Success criteria are unmeasurable** — "system remains usable", "native-feeling". | Replaced with numeric budgets in `10-quality-nfr-observability.md`. |
| **M-10** | **The 10 metrics are listed but never defined.** | "Repeat customer" — within 30 days? Ever? "Money made per order" — gross or contribution? Undefined metrics produce dashboards nobody trusts. All ten are defined in `07-analytics-and-metrics.md`. |

### 3.4 Over-reach — SRC-B asks for things SRC-A does not

Not errors, but they should be recognised as *our* proposals rather than client requirements,
and priced as such:

- **C4 in-app payments with UPI/cards/wallets.** SRC-A never mentions online payment. For a
  ₹15/shirt neighbourhood service, cash and a UPI QR at the door may cover the pilot entirely.
  A payment gateway adds KYC, settlement reconciliation, refund handling and webhook
  idempotency. Recommended: **ship COD + UPI-QR-at-door first, gateway in Phase 3.**
- **C3 one-tap reorder, C6 ratings, C7 referral system in-app.** All reasonable, all inferred.
- **F3 Route View / maps integration.** SRC-A implies route efficiency (A-11/A-12) but 3–5
  apartments within walking distance of the store do not need turn-by-turn navigation. An
  ordered job list plus a maps deep-link is sufficient; a routing engine is over-build.
- **Native iOS + Android apps as a v1 Must-Have.** See P-1.

---

## 4. Gaps — required by SRC-A, absent from SRC-B

These are the substantive additions. Each is traced to a statement in the client's own document.

| # | Gap | Traced to | Why it is not optional |
|---|---|---|---|
| **G-1** | **Physical garment identification — QR/barcode bag tags and scan-driven stage transitions.** | A-24, A-02 | 500–1,000 garments/day through one shop. Without a scannable tag on every bag, "inventory tracking" is a dropdown a busy operator forgets to update, and the data rots within days. A ₹2,000 thermal printer plus the staff app camera turns every stage change into a scan. **This is the highest-leverage missing feature in SRC-B.** |
| **G-2** | **Consumables & supplies inventory** — hangers, poly covers, packing bags, starch, detergent, utilities. Stock on hand, receipts, per-order consumption, reorder points. | A-04 ("before our other costs"), A-17 | SRC-B's "inventory management" covers only garment custody. The client asks *"Are we making enough after our costs?"* — that question is unanswerable without a cost of goods per order. This is the second meaning of "inventory" and SRC-B omits it entirely. |
| **G-3** | **Marketing spend ledger** — record influencer payments, flyer printing, ad spend, referral payouts, by channel *and* apartment. | A-16, A-09 | CAC by channel is a client-named weekly metric. There is no data source for it in SRC-B. A simple spend-entry screen is all that is needed, but without it the founder dashboard has a permanently empty tile. |
| **G-4** | **Slot capacity management** — finite pickup/delivery slots per cluster per day, and finite pressing throughput per day. | A-25, A-11 | SRC-B lets a customer choose any date/time. With one store, one automated press and one or two field staff, unconstrained booking guarantees broken promises — which destroys the on-time KPI (A-18). **Capacity is the third meaning of "inventory" and arguably the most valuable: you are selling slots.** |
| **G-5** | **Cash custody & reconciliation.** Cash a field staff member collects is a liability until deposited: staff cash-in-hand balance, handover records, deposit records, variance reporting. | A-04, A-17 | SRC-B's F5 is a "cash collection log" — a list, not a balance. At 50–100 mostly-COD orders/day this is precisely where money goes missing. |
| **G-6** | **Exception & claims handling** — damaged, lost, missing, wrong-item, re-press requests; the dispute, its resolution and its cost. | A-24 | The fastest way to lose a customer in this business is to lose their shirt. Zero coverage in SRC-B. Needs an owner, an SLA and a financial write-off path. |
| **G-7** | **Counter / walk-in intake (POS).** | A-11 ("Start close to the store") | The store is *in* the neighbourhood it serves. Walk-in drop-off is near-certain to be a real channel from week one. SRC-B has no non-pickup order path at all. The user's brief names "sales" as a pillar; this is it. |
| **G-8** | **Effective-dated pricing, commission rules and offers, with order-time snapshots.** | A-20 (explicit) | The client states these numbers will be tested and changed. Without versioning, testing them corrupts history. |
| **G-9** | **Referral-partner settlement ledger** — accrual per qualifying order, payable balance per watchman, settlement run, payout record. | A-04, A-22 | SRC-B says "simple settlement report". Money owed to third parties is a liability account, not a report. |
| **G-10** | **Audit log** for all money- and permission-sensitive actions. | Implied by A-04, A-20, A-22 | See M-7. |
| **G-11** | **Lapsed-customer re-engagement.** Identify customers who ordered once and not again; trigger a follow-up. | A-06 (explicit) | Named outright in the deck as the Day 31–60 core activity. Missing from SRC-B. |
| **G-12** | **Extensible service catalogue** — the model must accept "sneaker cleaning" without a migration of the order model. | A-14 (explicit) | SRC-B hardcodes ironing semantics throughout. Cheap to get right now, expensive later. |
| **G-13** | **Privacy, consent, retention and account deletion (India DPDP Act 2023).** | Not in either document | The system collects phone numbers, home addresses, and photographs of people's doorsteps. Legally required, and explicitly requested in the project brief. |
| **G-14** | **Multi-hub-ready schema.** Every operational row carries a hub. | A-23 (explicit) | The client's stated 90-day goal is to repeat the model in the next neighbourhood. Adding `hub_id` now costs nothing; retrofitting it after launch is a data migration under load. *(This is schema readiness, not multi-tenant SaaS — see ADR-013.)* |

---

## 5. Technology-stack corrections to SRC-B §6

The stack is right. Four claims in SRC-B are wrong or misleading:

| # | SRC-B claim | Correction |
|---|---|---|
| **T-1** | *"shadcn/ui + Tailwind … Consistent, modern look across web and (via NativeWind or similar) mobile."* | **shadcn/ui does not run on React Native.** It is Radix primitives + Tailwind for the DOM. NativeWind gives you Tailwind *class syntax* on mobile, not the components. Promising "shared components with mobile via design system" is a false promise. **What is genuinely shareable: design tokens, the API client, validation schemas and business rules. Components must be built twice.** Plan for it rather than discovering it in Phase 2. |
| **T-2** | *"Hosting — Web: Vercel or Railway/Render; API + DB: Railway/Render/AWS/DigitalOcean"* | Correct but worth stating unambiguously, since the project brief says "deployed over at Vercel": **Vercel hosts the Next.js web app only.** Django, PostgreSQL, Redis and Celery workers cannot run on Vercel and need a container host (Render or Railway recommended at this scale). |
| **T-3** | *"Auth — Django + JWT / Session + OTP"* — presented as one undifferentiated choice. | Two audiences need two schemes. **Staff/admin console: httpOnly cookie session + email/password + email verification + reset + optional TOTP.** **Customers and mobile: phone OTP, JWT with rotating refresh.** The project brief's "sign-up, email verification, password reset" belongs to the first; forcing it on customers adds friction the client explicitly warned against (A-01). |
| **T-4** | *"Notifications — FCM + WhatsApp (optional)"* | Inverted, for the same reason as P-1. **FCM only reaches customers who installed the app.** For the pilot cohort, WhatsApp and SMS are the primary channels and push is the optional one. |

**Schedule risk neither document mentions:** WhatsApp Business API onboarding requires Meta
business verification and per-template approval, and Indian SMS requires TRAI **DLT**
registration of sender headers and templates. Both are **1–3 week external lead times** that
cannot be compressed by working faster. They must start in Phase 0, in parallel with
development. *(Costs are small — roughly ₹0.11–0.15 per WhatsApp utility message and
₹0.15–0.25 per SMS; at ~400 messages/day that is under ₹100/day.)*

---

## 6. Corrected requirement register

Full requirement IDs, priorities and their sources. `M` = Must-have for pilot launch,
`S` = Should-have, `L` = Later.

| ID | Requirement | Pri | Source |
|---|---|---|---|
| **Booking & customer** | | | |
| R-101 | Book a pickup from a no-install web link (shareable over WhatsApp) | M | A-01, P-1 |
| R-102 | WhatsApp-initiated booking (template message → link, or conversational hand-off) | M | A-01, P-1 |
| R-103 | Counter / walk-in order intake at the store | M | G-7 |
| R-104 | Slot selection constrained by real capacity | M | G-4, A-25 |
| R-105 | Declared garment estimate at booking; price *estimate* shown, not a promise | M | M-1 |
| R-106 | Customer profile: multiple addresses, apartment + flat, contact, language | M | SRC-B C5 |
| R-107 | Order tracking by link, no login required (tokenised) | M | A-13 |
| R-108 | Order history + one-tap reorder | S | SRC-B C3 |
| R-109 | Post-delivery rating + free-text feedback | M | A-19 |
| R-110 | Referral code / link for customers | M | A-08 |
| R-111 | Weekly / monthly packages | L | A-07, P-3 |
| R-112 | In-app chat / support hand-off to WhatsApp | L | SRC-B C10 |
| **Operations & custody** | | | |
| R-201 | QR-tagged bags; stage transitions by scan | M | G-1 |
| R-202 | Intake verification: declared vs verified counts, variance, proof photo, re-quote | M | M-1 |
| R-203 | Per-garment / per-bag stage tracking with rework loop | M | M-4, A-24 |
| R-204 | Production board (hub view of WIP by stage, ageing, due today) | M | A-02 |
| R-205 | Exception handling: damaged / lost / missing / re-press, with resolution + cost | M | G-6 |
| R-206 | Daily pressing capacity model and load view | S | G-4 |
| R-207 | Consumables inventory: stock, receipts, per-order consumption, reorder alerts | M | G-2, A-17 |
| **Fulfilment** | | | |
| R-301 | Job assignment to field staff by route-day | M | A-11 |
| R-302 | Field job list with address, contact, slot, garment summary | M | SRC-B F1 |
| R-303 | Scan/one-tap status updates with photo or OTP proof | M | SRC-B F2 |
| R-304 | Offline write queue with conflict-safe sync | M | P-2 |
| R-305 | Call / WhatsApp customer from job card; maps deep link | M | SRC-B F3/F4 |
| R-306 | Failed pickup / failed delivery with reason and reschedule | M | M-2 |
| R-307 | On-time measured against the committed slot | M | A-18 |
| **Money** | | | |
| R-401 | Effective-dated price lists per service and garment type; order-time snapshot | M | G-8, A-20 |
| R-402 | Invoice generation (PDF), immutable once issued, credit notes for changes | M | SRC-B A3 |
| R-403 | Cash on delivery + UPI QR at door | M | §3.4 |
| R-404 | Online payment gateway (Razorpay), webhooks idempotent | S | SRC-B C4 |
| R-405 | Staff cash custody: cash-in-hand, handover, deposit, variance | M | G-5 |
| R-406 | Offers and discounts: first-order, referral credit, apartment-level promo | M | A-08, A-20 |
| R-407 | Refunds and write-offs with reason and approval | S | G-6 |
| R-408 | Per-order cost model → contribution margin | M | A-17, A-04 |
| **Growth & attribution** | | | |
| R-501 | Referral partners (watchmen, influencers) as managed entities with codes | M | A-22 |
| R-502 | First-touch attribution: channel + apartment + partner, immutable | M | A-03 |
| R-503 | Commission accrual per qualifying order, per configurable rule | M | A-04, G-9 |
| R-504 | Payable balance per partner, settlement run, payout record | M | G-9 |
| R-505 | Marketing spend ledger by channel / campaign / apartment | M | G-3, A-16 |
| R-506 | Lapsed-customer segment + re-engagement campaign trigger | M | A-06, G-11 |
| **Territory** | | | |
| R-601 | Apartment, cluster and hub master data with active/inactive status | M | A-10, A-12 |
| R-602 | Serviceability check by pincode / apartment at booking | M | A-11 |
| R-603 | Route-day capacity per cluster | M | G-4 |
| **Analytics** | | | |
| R-701 | The 10 founders' weekly numbers, defined and automated | M | A-15 |
| R-702 | Apartment-wise performance report | M | A-10 |
| R-703 | Channel performance and cohort quality | M | A-09 |
| R-704 | Day 30 / 60 / 90 checkpoint report, as-of a date | M | A-21 |
| R-705 | Export every report to PDF and Excel | M | Brief |
| R-706 | Cohort retention, LTV, apartment heat-map | L | SRC-B A14 |
| **Platform** | | | |
| R-801 | Role-based access with object-level scoping | M | M-6 |
| R-802 | Immutable audit log of money- and permission-sensitive actions | M | M-7, G-10 |
| R-803 | Notification router: WhatsApp / SMS / push / email, templated, with delivery log | M | T-4, A-13 |
| R-804 | Multi-hub-ready schema | M | G-14, A-23 |
| R-805 | Extensible service catalogue (sneaker cleaning without re-modelling) | M | G-12, A-14 |
| R-806 | Consent, retention policy, account deletion with financial-record retention | M | G-13, Brief |
| R-807 | Crash / error reporting across API, web and mobile | M | Brief |
| R-808 | Full UI state coverage: loading, empty, error, offline, permission-denied, 404 | M | Brief |
| R-809 | WCAG 2.2 AA accessibility | M | Brief |
| R-810 | Responsive from 320 px to ultrawide | M | Brief |

---

## 7. Summary judgement on SRC-B

**Usable as a starting point; not safe to send to the client as-is.**

- 4 priority inversions, one of which (WhatsApp) inverts the client's own stated preference.
- 10 modelling errors, of which 3 (M-1 estimate-vs-actual, M-3 conflated state machines,
  M-5 unversioned pricing) would require rework after launch if built as written.
- 14 gaps, of which 5 (G-1 tagging, G-2 consumables, G-3 spend, G-4 capacity, G-5 cash) are
  traced directly to statements in the client's own document.
- 2 internal contradictions (CAC priority, referral credit scope).

The corrected register in §6 supersedes SRC-B §3. `09-open-decisions.md` lists what the client
must confirm before Phase 1 closes.

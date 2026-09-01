# 09 — Open Decisions

Questions the client must answer before Phase 1 closes. **Each has a working assumption** so
development is never blocked — but an assumption that turns out wrong after Phase 3 is rework,
and the ones marked ⚠️ are expensive to reverse.

## A. Commercial model

| # | Question | Working assumption | Cost if wrong |
|---|---|---|---|
| **D-01** ✅ **CLIENT DECIDED** | Is the watchman commission paid on the first order only, on every order, or on the first N orders? | **First-order only, matching SRC-A's example — with an admin-configurable override.** `CommissionRule.applies_to` defaults to `FIRST_ORDER_ONLY` but ops/founder can switch a partner to `ALL_ORDERS` or `FIRST_N_ORDERS` per `02 §3.10`. | Resolved. The rule engine already supported this; no schema change needed. |
| D-02 | Pricing basis: per item, per kg, or both by service? | Per item for ironing; the model supports per-kg for future services | Low — `Service.unit` already handles it |
| **D-03** | **Is an online payment gateway needed at launch, or do COD + a UPI QR at the door suffice for the pilot?** SRC-A never mentions online payment. | COD + UPI QR at launch; Razorpay in Phase 3 but deferrable | Medium — 3 days of work either way, but a gateway brings KYC, settlement reconciliation and refund handling that the pilot may not need |
| **D-04** ✅ **CLIENT DECIDED** | Is GST applicable? | **Admin-configurable, per invoice.** A hub-level setting (`TaxSettings.gst_enabled`, `gstin`, default rate) controls whether GST is applied by default; an ops/admin user can toggle it per invoice at issue time. `Invoice.tax_minor` and `Invoice.gstin_snapshot` are populated only when GST is on for that invoice. | Resolved. `catalog`/`billing` models carry a `TaxSettings` row per hub and a per-invoice override flag — see `02` domain model update. |
| D-05 | First-order discount: amount, and one per customer or one per flat? | 20% off the first order, one per verified phone number | Low |
| **D-06** | **Referral reward: account credit, or a discount on the next order?** SRC-B contradicts itself (`00 §3.3 M-8`). | Account credit, on a proper append-only ledger | Medium — a credit ledger is built either way; the question is whether the UI exposes a balance |
| D-07 | Cancellation and refund policy: free until when? Charged after pickup? | Free until pickup; after intake the verified amount is payable | Medium — affects the state machine and customer messaging |
| D-08 | Delivery charge: free, threshold-based, or flat? | Free within the serviced cluster in v1 | Low |

## B. Metric definitions *(these are as much a sign-off item as the feature list)*

| # | Question | Working assumption |
|---|---|---|
| **D-09** | **"Repeat customer" — a second order within how many days?** | 30 days (`07 §2②`). A weekly-use service justifies a tighter window than a monthly one. |
| D-10 | Does a customer count on first *booking* or first *delivered order*? | First delivered order — a cancelled booking is a lead, not a customer |
| D-11 | On-time grace period? | 15 minutes past the slot end |
| D-12 | When a customer reschedules, whose miss is it? | The customer's; the original promise is retained and attributed to them |
| D-13 | Does "money made per order" mean contribution margin or net profit? | Contribution margin — fixed costs excluded and labelled as such (`07 §2⑧`) |
| D-14 | Should labour be allocated per order, and at what rate? | Yes, at a configurable per-minute rate, shown as an estimate |

## C. Operations

| # | Question | Working assumption |
|---|---|---|
| D-15 | Standard turnaround time (pickup → delivery)? | 24 hours, configurable per service |
| D-16 | Pickup/delivery slot windows — how many, how long? | Four 2-hour windows: 8–10, 10–12, 16–18, 18–20 |
| **D-17** ✅ **CLIENT DECIDED** | Daily pressing capacity (garments/day)? | **Not yet known — start slow, grow exponentially.** Capacity is not hardcoded: `RouteDayCapacity` and a per-hub `PressingCapacity` setting are both admin-editable (per cluster, per day) from the console, defaulting to a conservative placeholder (150/day) that ops raises week over week as the pilot proves out throughput. | Resolved as "configurable, admin-tuned" rather than a fixed number — which is what the architecture already assumed (`02` `RouteDayCapacity`). No blocker to Phase 1. |
| D-18 | Count variance threshold before a customer re-quote is required? | Greater of 2 items or 15% of declared value |
| D-19 | Number of delivery attempts before returning to the hub? | 2, then hold at hub and contact the customer |
| **D-20** | **Bag tagging: per bag, or per garment?** | Per bag, with a garment count. Per-garment tagging is 10× the labour for marginal gain at this volume — but it is the only way to be certain about a single lost shirt. |
| D-21 | Who resolves damage claims, and what is the compensation policy? | Ops manager; up to 10× the item's press price, founder approval above that |
| D-22 | Are walk-in customers to be registered, or handled anonymously? | Registered by phone — otherwise they are invisible to every metric |

## D. Technical & platform

| # | Question | Working assumption |
|---|---|---|
| D-23 | Domain name and subdomain scheme? | `ironman.<tld>`, `api.`, `staging.`, `api-staging.` |
| D-24 | Who owns the Meta Business, DLT, Razorpay and Google Cloud accounts? | Client owns all; we are granted delegated access. **Never build a business on provider accounts registered to the developer.** |
| D-25 | Hosting budget per month? | ~$40–70: Render (API + worker + Postgres + Redis) + Vercel Pro + R2 + Sentry |
| **D-26** ✅ **CLIENT DECIDED** | Is a thermal label printer available at the store? | **Not yet confirmed as present — build for both paths.** Bag tag generation supports (a) direct thermal print (58mm ESC/POS via browser print or Bluetooth) **and** (b) a fallback numbered-tag sheet the operator prints on any printer and matches to bag codes by hand at intake. The intake screen accepts either. | Resolved as "support the manual fallback from day one" — `custody.services.tagging` implements both paths so the printer's absence never blocks intake (`ADR-007` updated). |
| D-27 | Devices the field staff will use? | Personal mid-range Android phones — hence the PWA-first decision and the strict performance budgets |
| D-28 | Languages at launch? | English; i18n scaffolded for Hindi/Kannada (`05 §9`) |
| D-29 | Brand assets — logo files, exact hex values, typeface licence? | IronMan Yellow `#F5C518` on near-black `#0B0B0C`, Inter. **Placeholder pending real assets.** |
| D-30 | Who is the named DPDP grievance officer? | Founder — **must be published in the privacy notice** |

## E. Scope confirmations

| # | Question | Working assumption |
|---|---|---|
| D-31 | Confirm the corrected feature list (`01 §6`) supersedes SRC-B §3 | Yes |
| D-32 | Confirm the pilot may start after Phase 3 rather than waiting for the full v1 | **Recommended** (`08 §2`) — four weeks of real data will reshape Phases 4–6 more than further planning will |
| D-33 | Confirm native mobile apps are a Phase 8–9 retention product, not a v1 launch gate | Yes (`00 §3.2 P-1`) |
| D-34 | Confirm the effort reality: ~178 engineer-days for the web platform, not the 45–65 SRC-B implies | Needs an explicit conversation |
| D-35 | Is sneaker cleaning expected within 6 months? | Not in v1; the catalogue supports it without re-modelling (`R-805`) |

---

## The four settled first — client decisions, 1 Sept 2026

1. **D-01 — commission structure: first order only, admin can override.** Matches SRC-A's own
   example. `CommissionRule.applies_to` defaults to `FIRST_ORDER_ONLY`; ops/founder can switch a
   partner to `ALL_ORDERS` or `FIRST_N_ORDERS` from the console at any time. No schema impact.
2. **D-17 — daily pressing capacity: not fixed, start conservative and raise it.** Confirms the
   architecture's own assumption — capacity is admin-editable per cluster per day
   (`RouteDayCapacity`), not a constant. Ships with a conservative placeholder that ops tunes
   weekly against real throughput.
3. **D-26 — label printer: not yet confirmed present, so both paths are built.** Direct thermal
   print (58 mm ESC/POS) **and** a printable numbered-tag fallback matched to bag codes by hand
   at intake. Garment tracking works from day one either way.
4. **D-04 — GST: admin-configurable per invoice, not fixed for v1.** A hub-level `TaxSettings`
   row (enabled flag, GSTIN, default rate) with a per-invoice override at issue time. Confirmed
   *not* out of scope — it ships in Phase 3 as a toggle, not a v1.1 item.

All four are reflected in the domain model (`02`) and the ADR log where they change a prior
assumption. **Phase 1 is unblocked.**

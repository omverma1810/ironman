# 09 — Open Decisions

Questions the client must answer before Phase 1 closes. **Each has a working assumption** so
development is never blocked — but an assumption that turns out wrong after Phase 3 is rework,
and the ones marked ⚠️ are expensive to reverse.

## A. Commercial model

| # | Question | Working assumption | Cost if wrong |
|---|---|---|---|
| **D-01** ⚠️ | **Is the watchman commission paid on the first order only, on every order, or on the first N orders?** SRC-A says *"₹3 for a successful referral"* — it does not say what "successful referral" means. | First-order only, configurable per partner | **This is a 5× swing in unit economics.** A ₹3 commission on every order forever versus once is the difference between a viable and an unviable channel. The rule engine (`02 §3.10`) makes it configurable, so the *code* is safe — but the founders' margin model is not. Answer before pricing anything. |
| D-02 | Pricing basis: per item, per kg, or both by service? | Per item for ironing; the model supports per-kg for future services | Low — `Service.unit` already handles it |
| **D-03** | **Is an online payment gateway needed at launch, or do COD + a UPI QR at the door suffice for the pilot?** SRC-A never mentions online payment. | COD + UPI QR at launch; Razorpay in Phase 3 but deferrable | Medium — 3 days of work either way, but a gateway brings KYC, settlement reconciliation and refund handling that the pilot may not need |
| D-04 | Is GST applicable, and at what rate? Is a GSTIN registered? | No GST in v1; a tax field exists on every money row and is set to zero | Medium — retrofitting tax onto issued invoices is painful. **Confirm early even though it is "out of scope".** |
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
| D-17 | Daily pressing capacity (garments/day)? | 600/day placeholder — **needs a real number from the machine and the operator**, since it caps every booking |
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
| **D-26** | **Is a thermal label printer available at the store?** | Yes — a 58 mm Bluetooth/USB unit under ₹3,000. **`G-1` and much of the inventory value depend on this.** If not, fall back to pre-printed numbered tags mapped to bag codes at intake. |
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

## The four to settle first

If the client's time is limited, these are the ones where a wrong assumption costs real money
or real rework:

1. **D-01 — commission structure.** Changes the unit economics of the entire watchman channel,
   which is the founders' primary acquisition idea.
2. **D-17 — daily pressing capacity.** Caps every booking. A wrong number either turns away
   demand or breaks the on-time promise — the founders' own headline KPI.
3. **D-26 — label printer availability.** Determines whether garment tracking is scan-driven
   (works) or manual (rots within weeks).
4. **D-04 — GST applicability.** Cheap to build in now; expensive and legally awkward to
   retrofit onto invoices that have already been issued.

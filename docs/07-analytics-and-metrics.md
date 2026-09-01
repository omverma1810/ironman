# 07 — Analytics & Metrics

## 1. Why this document exists

The founders' plan (SRC-A p.6) lists ten numbers to check every week. SRC-B copied the list
verbatim and stopped there (`00 §3.3 M-10`). **An undefined metric produces a dashboard nobody
trusts** — and a dashboard nobody trusts sends the founders back to a spreadsheet, which is
exactly the outcome the platform exists to prevent.

Every metric below has: a formula, a grain, a source, an edge-case rule, and a drill-down. The
definitions are as much a client-sign-off artefact as the feature list — see `09-open-decisions.md`.

## 2. The founders' ten weekly numbers

Business week = **Monday 00:00 → Sunday 23:59 IST**, aligned to the hub cutoff. All figures are
also computable for any arbitrary window (`A-21` Day 30/60/90 checkpoints).

---

**① New Customers** — *"How many people tried IronMan this week?"*

```
COUNT(DISTINCT customer) WHERE customer.first_order_at ∈ [week]
                           AND that first order reached DELIVERED
```
- **Grain:** week × apartment × cluster × channel
- **Rule:** a customer counts on the date of their **first delivered order**, not first booking.
  A cancelled first booking is a lead, not a customer — counting it inflates CAC and flatters
  the funnel.
- **Watch:** duplicate accounts from phone typos. `CustomerMergeLog` corrections retro-apply.
- **Drill-down:** the customer list, with apartment and channel.

---

**② Repeat Customers** — *"How many came back?"*

Two figures, because the deck asks two different questions in one line and conflating them is
how this metric usually becomes useless:

```
R1  Returning-this-week  = COUNT(DISTINCT customer) with ≥1 delivered order this week
                            AND ≥1 delivered order before this week
R2  Cohort repeat rate   = of customers first delivered in week W,
                            the share with a 2nd delivered order within 30 days
```
- `R1` is the weekly operating number. `R2` is the one that answers the client's real 30/60/90
  question (*"50–60 repeat customers from the first 100"*) and only matures 30 days after a
  cohort forms — the dashboard shows it as *maturing* until then rather than showing a
  misleadingly low figure.
- **Assumed definition of "came back": a second delivered order within 30 days.** This is a
  client decision (`09` D-09) — 30 days suits a service people use every week or two.

---

**③ Orders per Customer** — *"Are people using us regularly?"*

```
delivered_orders_in_period / active_customers_in_period
```
- Reported two ways: **period frequency** (this week) and **lifetime average** (all time).
- The founders' real question is habit formation, so the dashboard headline is a **cohort
  frequency curve**: for customers acquired in month M, average orders in weeks 1, 2, 3, 4…
  A flat curve means no habit; a rising curve means the model works.

---

**④ Cost to Get a Customer (CAC)** — *"How much are we spending to get each new customer?"*

```
CAC(channel, period) = ( Σ Spend rows for that channel/period
                       + Σ CommissionAccrual attributable to first orders in that period )
                       ÷ New Customers (①) attributed to that channel
```
- **This is the metric SRC-B could not have produced.** `Spend` (`02 §3.10`) is the missing data
  source; `G-3` added it. Without someone entering "₹4,000 to an influencer on 12 Sept, targeting
  Prestige Lakeside", CAC is permanently null.
- **Includes referral commission on first orders** — a ₹3 watchman payment *is* customer
  acquisition cost, and excluding it makes the watchman channel look free.
- **Blended CAC** = total spend ÷ total new customers, shown alongside per-channel.
- Organic and walk-in have zero spend and are excluded from the denominator of paid CAC but
  shown separately, so a good organic month does not fake an improvement in paid efficiency.
- **Drill-down:** spend rows and the customers attributed to them.

---

**⑤ Referrals** — *"How many customers came through friends, neighbours or watchmen?"*

```
COUNT(new customers in period WHERE attribution.channel ∈
      {WATCHMAN, CUSTOMER_REFERRAL}) , split by channel and by partner
```
- Paired with **commission accrued** and **commission settled** in the same period, so the
  founders see volume and cost together.
- **Per-partner leaderboard**: which watchman actually delivers. `A-03` asks for exactly this.

---

**⑥ Apartment-wise Customers & Orders** — *"Which apartments are working best?"*

Per apartment, per period: customers · new customers · orders · repeat rate · AOV ·
contribution margin · on-time % · average rating · **orders per active customer** ·
**days since launch**.

- **Days since launch is what makes the comparison honest.** An apartment live for 5 days and
  one live for 60 are not comparable, and ranking them on raw order count would send the
  founders into the wrong building. Default sort is **orders per active customer per week since
  launch**.
- Presented as a ranked table in v1; a heat-map is `R-706` (later).
- Directly answers SRC-A p.4 *"Find the apartments where people are ordering again"*.

---

**⑦ Average Order Value (AOV)**

```
AOV = Σ invoice.total_minor (delivered, non-cancelled) ÷ COUNT(those orders)
```
- **Gross AOV** (after discount, before cost) is the headline, matching the client's phrasing
  *"How much does an average order bring in?"*
- Also reported: median (AOV is skewed by the occasional 40-garment order), and AOV by apartment
  and by channel.
- Cancelled and written-off orders excluded; credit notes deducted.

---

**⑧ Money Made per Order** — *"Are we making enough after our costs?"*

**Contribution margin per order.** The most demanding metric in the list, and the one that makes
`G-2` (consumables) non-optional:

```
Revenue            invoice.total_minor (net of discounts and credit notes)
 −  Consumables    Σ OrderCost(CONSUMABLE)   ← StockMovement × unit cost, via ConsumptionRule
 −  Commission     Σ OrderCost(COMMISSION)   ← CommissionAccrual for this order
 −  Direct labour  Σ OrderCost(LABOUR)       ← allocated: rider minutes + press minutes × rate
 −  Delivery       Σ OrderCost(DELIVERY)     ← fuel/allowance allocated per job
 =  Contribution margin (₹ and %)
```
- Fixed costs (rent, salaries, the press itself) are **excluded** — this is contribution, not
  net profit, and the dashboard says so on the tile. Conflating them produces a number that is
  both wrong and demoralising.
- Labour allocation uses a configurable rate; it is an estimate and is **labelled as one**.
  Precision here is less valuable than consistency over time.
- Sanity check against the client's own arithmetic: a ₹15 shirt with ₹3 watchman commission
  leaves ₹12 before consumables and labour (`A-04`). The system computes the rest of that
  sentence, which the founders currently cannot.

---

**⑨ On-time Pickup / Delivery** — *"Are we keeping our promise?"*

```
On-time % = COUNT(jobs completed within [slot_start, slot_end + grace])
            ÷ COUNT(completed jobs)
```
- **Requires a recorded promise.** The committed slot is written at `SCHEDULED` and is
  immutable; a reschedule creates a **new** promise and the original is retained as a miss
  attributed to whoever requested it (customer vs IronMan). Without this rule, on-time can be
  gamed to 100% by moving the goalposts — which is the standard failure mode of this metric.
- Grace period: **15 minutes**, configurable, shown on the tile.
- Split: pickup vs delivery · by staff · by cluster · by slot window.
- Failed attempts count as misses unless the reason code is customer-caused (`CUSTOMER_ABSENT`,
  `CUSTOMER_RESCHEDULED`) — and both numbers are shown, because "our fault" and "their fault"
  are different problems.

---

**⑩ Customer Feedback** — *"Are customers happy?"*

- Average rating (1–5), response rate, distribution, **NPS-style split** (4–5 promoters, 3
  passive, 1–2 detractors).
- Trend by week, by apartment, by staff member.
- **Every ≤2 rating raises an alert and an exception record** with an owner and an SLA — a bad
  rating in a 100-customer business is a retention emergency, not a data point.
- Response rate is itself a metric: a 6% response rate makes a 4.8 average meaningless.

---

## 3. Beyond the ten — what the 30/60/90 checkpoints need

SRC-A p.7 asks specific questions at Day 30, 60 and 90. `GET /analytics/checkpoint?as_of=`
answers them directly:

| Checkpoint question (SRC-A p.7) | Report section |
|---|---|
| *"Are customers actually using the service?"* | Orders, active customers, frequency curve |
| *"Which apartments and marketing methods are working?"* | Apartment ranking (⑥) + channel table (④/⑤) |
| *"Is our pricing making sense?"* | AOV (⑦) vs contribution (⑧), by price-list version |
| *"Which customers are coming back?"* | Cohort repeat curve (②R2) |
| *"Which marketing channels are worth continuing?"* | CAC (④) vs 60-day revenue per acquired customer, by channel |
| *"Can we repeat this model in the next cluster?"* | Cluster P&L: contribution vs spend, by weeks-since-launch |
| *"What should we continue, change or stop?"* | Price-list-version comparison + offer performance |

**Price-list-version comparison is only possible because pricing is effective-dated** (`M-5`,
ADR-005). Being able to say *"at ₹15 we did X, at ₹18 we did Y"* is precisely the experiment the
client said they would run — and mutable prices would have destroyed the evidence.

## 4. Implementation

### 4.1 Rollups, not live aggregation

Nightly Celery jobs (`rollup` queue, 00:30 IST) materialise:

```
fact_order_daily        date × hub × cluster × apartment × channel × service
                        → orders, gross, discount, net, cogs, commission, contribution,
                          on_time_pickup, on_time_delivery, avg_rating
fact_customer_daily     date × customer → orders, gross, is_new, is_returning
dim_customer_cohort     customer → cohort_week, acquisition_channel/apartment/partner
fact_spend_daily        date × channel × campaign × apartment → amount
fact_stock_daily        date × hub × item → opening, receipts, issues, closing, value
agg_weekly_metrics      week × hub → the ten numbers, pre-computed
```

Rationale (ADR-011): every founder query then reads a table with a few thousand rows. Postgres
returns them in single-digit milliseconds, the dashboard has no cold path, and there is no second
data store to operate. At ~36k orders/year a warehouse would be equipment for its own sake.

**Backfill and correction:** rollups are idempotent per date and re-runnable. Late-arriving facts
(an offline sync landing next morning, a customer merge, a credit note) trigger a re-run of the
affected dates. A metric that silently disagrees with its own drill-down is worse than no metric,
so **every tile links to the rows that produced it** and a mismatch is a test failure.

### 4.2 Dashboard design

| Surface | Content |
|---|---|
| **Founder weekly** (`/console/analytics/weekly`) | Ten tiles in the deck's own order, each with the current value, week-over-week delta, sparkline and a drill-down link. Week picker. One-click PDF/Excel export. |
| **Apartment performance** | Ranked table (⑥) + per-apartment detail with a timeline of launch, spend and orders |
| **Channel performance** | Volume, CAC, repeat rate, 60-day revenue per acquired customer |
| **Unit economics** | Waterfall: revenue → consumables → commission → labour → delivery → contribution |
| **Operations daily** (`/console/analytics/operations`) | For ops, not founders: today's on-time, WIP by stage with ageing, capacity utilisation, overdue orders, open exceptions |
| **Checkpoint** | The Day 30/60/90 report, as-of any date, formatted for a founders' meeting |

Chart conventions follow one system across the product: consistent series colours, no dual axes,
no pie charts beyond a two-way split, direct labelling in preference to legends, tabular figures,
and an explicit empty state for every chart (a chart with no data must say so, not render an
empty grid).

### 4.3 Exports — `R-705`

- **Excel (`openpyxl`)**: one sheet per section, frozen headers, real number and currency
  formats, a parameters sheet recording filters and generation time. Numbers arrive as numbers,
  not strings — an accountant should be able to pivot the file without cleaning it.
- **PDF (WeasyPrint)**: branded, print-ready, page numbers, footer with the generation timestamp
  and the person who generated it.
- **CSV**: raw rows for anyone who wants to do their own analysis.
- Generated asynchronously (`reports` queue) → R2 → 24-hour signed URL. Every export of
  customer-level data is audit-logged (`06 §3.3`).

### 4.4 Data quality guardrails

Metrics fail silently unless something watches them. A nightly check writes a data-quality
report and alerts ops when:

- new customers with a null acquisition channel > 5% (`SC-6` breach)
- orders with a manual (unscanned) stage transition > 20% — the leading indicator that the tag
  workflow is being bypassed and the inventory data is going stale
- orders delivered without a recorded payment > 24 h
- staff cash variance ≠ ₹0
- consumable issues missing for delivered orders (breaks metric ⑧)
- rollup row counts deviating from source counts

That last group is the difference between a dashboard the founders act on and one they quietly
stop opening.

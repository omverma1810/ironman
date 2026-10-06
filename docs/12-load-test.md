# 12 — Load test (batch 7.6)

How the API holds up at the volume `docs/10` NFR-11 asks for (3× the expected peak), what the test
found, and what was fixed. Re-run it before launch (§6): this was done on a developer machine, not on
the real stack.

## 1. What was tested

- **Data.** A year of pilot volume: 36,000 orders (the latest week averages 230 a day and peaks at 890, against the plan's 100),
  1,500 customers, 34,000 invoices and payments, 110,000 order events, 35,000 audit rows,
  11,000 notifications, 9,000 jobs across eight riders. Built by `seed_demo` then `seed_load`
  (`apps/api/common/management/commands/seed_load.py`). It refuses to run in production.
- **Server.** Gunicorn with the same flags as the Docker image (2 workers × 4 threads), pinned to one
  CPU core to stand in for one 1-vCPU Cloud Run instance, with PostgreSQL 16 on the same machine.
- **Traffic.** Locust (`apps/api/loadtest/locustfile.py`): customers browsing, getting quotes and booking
  (with phone-code sign-in); an operator working the order board, customers and billing; a founder
  opening the dashboards and reports; riders loading their jobs. Each simulated user waits 1–3 s
  between actions.
- **Pass mark.** The run exits non-zero if any `docs/10` target is missed: reads p95 < 400 ms and
  p99 < 900 ms, writes p95 < 600 ms, dashboard < 800 ms, error rate < 0.5%.

The plan's peak is about 5 requests a second (`docs/03`); 3× is 15. The runs below reached 7 (one
instance) and 22 (two instances).

## 2. Results

| Run | Load | Result |
|---|---|---|
| 1 instance, expected peak | 10 users, 7 req/s, 3 min | **Every target met.** Overall p50 78 ms, p95 330 ms. Order booking p95 580 ms, order board p95 160 ms, dashboard p95 500 ms. No errors. |
| 1 instance, 3× peak | 30 users, 18 req/s | **Saturated.** About 17 req/s is the ceiling of one core; at 18 the typical request still takes 220 ms but p95 is 1.4 s. Requests queue; nothing fails. |
| 2 instances, 3× peak | 2 × 15 users, 22 req/s | Overall p50 88 ms, p95 ~420 ms, p99 790–1,300 ms, no errors. Four endpoints still just miss on one or both instances: rider job list (p95 410–540), order booking (690–780 vs the 600 write target), invoice list (430) and the uninvoiced-deliveries list (490). |

Reading it: one instance meets every target at the plan's peak. At 3× the plan needs more than two
instances, and I expect three to clear the remaining misses (the two-instance run is within about a
third of each target, at 22 req/s, which is 1.5× the 3× figure). **Three instances were not tested**: the
machine has four cores. Cloud Run is configured for up to four and adds instances on CPU load, so
the headroom exists, but it has not been demonstrated.

Per-request CPU is the limit, not the database: an order booking runs 55 small queries and
spends about 45 ms in Python for 13 ms in the database; a list is 5–9 queries.

## 3. What the test found, and the fixes

Measured on the same data, one request, nothing else running.

| Screen | Before | After |
|---|---|---|
| Weekly dashboard (`/analytics/weekly`) | 24 s | 0.9 s cold; ~0.3 s when earlier weeks are cached |
| Day 30/60/90 checkpoint | 22 s, **7,796 queries** | 4.4 s, 43 queries (see §4) |
| Channel report | 349 ms, 181 queries | 179 ms, 19 queries |
| Apartment report | 905 ms | 315 ms |
| Invoice list (founder) | 197 ms in the database | 0.6 ms |
| Order list (founder) | 133 ms in the database | 0.7 ms (the other 17 ms was planning the eight-table join; it is now 2–3 ms) |
| Notification log, audit log | 51 ms, 38 ms in the database | 0.1 ms each |
| Route-day list, attribution list | 30 queries each | 5 each |

Causes and changes:

- **A question per customer.** The repeat-customer cohort, the channel report and the checkpoint
  asked the database about each customer in turn. They now fetch the cohort once. A test
  (`analytics/tests/test_query_budget.py`) fails if a report's query count grows with the number of
  customers, and it failed before the fix.
- **Everything computed for every week.** The dashboard computes ten metrics for nine windows and
  shows one number from each; it was also building every drill-down table. It now builds the numbers
  only (the drill-down still builds its rows and is tested to agree with the tile), looks up each
  customer's first delivery once per request (`DISTINCT ON` in the database instead of sieving 34,000
  rows in Python), and keeps earlier, finished weeks' sparkline values for 5 minutes
  (`ANALYTICS_PAST_WEEK_CACHE_SECONDS`; 0 in tests, so figures there are always live). This week's
  tile and every drill-down are never cached. A correction to an earlier week (a credit note, say)
  appears in the sparkline within 5 minutes.
- **Missing indexes.** Lists sorted newest-first with no index to sort by, so the database sorted the
  whole table for every page. Added `created_at` indexes on orders, invoices, notification requests
  and the audit log, and partial indexes for "delivered in this window" and "delivered before" on
  orders (migrations `ordering/0004`, `billing/0007`, `notifications/0002`, `identity/0003`).
- **Too many joins.** The order list joined eight tables, one of them unused, and also loaded every
  order's lines without showing them. Planning that query cost 17 ms against 1 ms to run. The list now
  joins four.
- **Two N+1s.** Route days counted jobs one route day at a time; attributions loaded each customer
  separately.

## 4. Known limits

- **The checkpoint report grows with the business.** It covers everything since launch, so it takes
  about 150 µs per delivered order: ~1.4 s at the 90-day mark it was designed for, 4–6 s at a year's
  volume. It is opened rarely. If it becomes routine, it wants a rollup table.
- **The first dashboard open after 5 idle minutes is the slow one** (about 0.9 s here). Anything
  later within 5 minutes is fast.
- **"Uninvoiced deliveries"** scans all delivered orders (35 ms here, linear in orders).
- **Local numbers understate production.** The database here is on the same machine. Supabase adds a
  network round trip to every query, so the query counts matter more there: an order booking is 55
  queries, and at 2 ms each that is ~110 ms the table above doesn't include.
- **Login is not representative.** The test settings use a fast password hasher; production's is
  deliberately slow (a few hundred ms of CPU per login).

## 5. Recommendations (not done)

- **Reuse database connections.** Django opens a new connection on every request (`CONN_MAX_AGE` is
  0). Over the network to Supabase that is a TLS handshake each time, likely the biggest single
  per-request cost in production, and not visible in this test. It isn't safe to switch on blind: it
  depends on whether `DATABASE_URL` uses Supabase's direct port (5432, fine) or its transaction
  pooler (6543, which needs `prepare_threshold` turned off). Check the port in the secret; then it is
  a two-line change.
- **Gunicorn's 2-second keep-alive** reset connections for a client that reuses them at 30 users
  (every error in the one-instance 3× run; none with `--keep-alive 65`). It would only matter if
  Cloud Run's front end behaves the same way, which I haven't verified, so the image is unchanged.
- **Run this against the real stack before launch** (§6): the cloud database, a Cloud Run instance with
  the production settings, and a copy of the pilot data. There is no staging environment today.

## 6. Re-running it

```
pip install locust                                   # not a project dependency
cd apps/api
createdb ironman_load                                  # a throwaway database
DATABASE_URL=postgres://…/ironman_load DJANGO_SETTINGS_MODULE=config.settings.loadtest \
  sh -c 'python manage.py migrate && python manage.py seed_demo && python manage.py seed_load'
DATABASE_URL=… DJANGO_SETTINGS_MODULE=config.settings.loadtest \
  taskset -c 0 gunicorn config.wsgi --workers 2 --threads 4 --bind 127.0.0.1:8000 &
locust -f loadtest/locustfile.py --headless --host http://127.0.0.1:8000 \
  --users 10 --spawn-rate 2 --run-time 3m        # ~expected peak; use 30 for 3×
```

Never point it at production: it creates customers and orders, needs the test-only phone-code debug
endpoint, and would trip the sign-in rate limits.

"""Load test for the IronMan API (docs/08 batch 7.6, docs/10 NFR-01/02/09/11).

    # against a throwaway local stack seeded with `seed_demo` + `seed_load`:
    locust -f loadtest/locustfile.py --headless --host http://127.0.0.1:8000 \\
        --users 30 --spawn-rate 5 --run-time 5m

NEVER point this at production: it creates customers and orders, and it needs
the OTP debug endpoint that only `config.settings.test` exposes.

Sizing. The plan expects ~100 orders a day and a peak of about 5 requests per
second (docs/03 §1); NFR-11 asks for headroom at three times that. Every
simulated user waits 1-3 s between actions, so `--users 10` is roughly the
expected peak and `--users 30` is the 3x peak. Mix: customers browsing and
booking, ops staff working the order/customer/billing screens, a founder
looking at the dashboards, and riders on the field app.

The run fails (non-zero exit) when a target from docs/10 is missed.
"""

from __future__ import annotations

import itertools
import os
import random
import uuid

from locust import HttpUser, between, events, task

STAFF_PASSWORD = os.environ.get("LOAD_STAFF_PASSWORD", "IronMan@2026")
PHONE_BASE = 9_000_000_000 + random.randint(0, 99_999) * 1000
_phones = itertools.count(PHONE_BASE)

# docs/10: reads p95 < 400 ms, p99 < 900 ms; writes p95 < 600 ms; the
# dashboard (NFR-09) renders in < 800 ms.
READ_P95_MS, READ_P99_MS, WRITE_P95_MS, DASHBOARD_MS = 400, 900, 600, 800
DASHBOARD_PATHS = ("/analytics/weekly",)
# Reports computed over the whole life of the business, opened rarely and not
# part of the NFR-09 dashboard; held to a generous bound so a regression to
# per-row queries (the 22 s checkpoint) still fails the run.
SLOW_REPORT_PATHS = {"/analytics/checkpoint": 6000}


class Catalogue:
    """Ids every persona needs, looked up once through a staff login."""

    hub = service = apartment = None
    garments: list[str] = []
    order_ids: list[str] = []
    refs: list[str] = []
    customer_names: list[str] = []

    @classmethod
    def load(cls, client):
        if cls.hub:
            return
        client.post(
            "/api/v1/auth/login",
            json={"email": "founder@ironman.test", "password": STAFF_PASSWORD},
            name="(setup) login",
        )
        cls.hub = client.get("/api/v1/territory/hubs/").json()["results"][0]["id"]
        cls.service = client.get("/api/v1/catalog/services/").json()["results"][0]["id"]
        cls.garments = [
            g["id"]
            for g in client.get(
                f"/api/v1/catalog/garment-types/?service={cls.service}&limit=100"
            ).json()["results"]
        ]
        cls.apartment = client.get("/api/v1/territory/apartments-admin/").json()["results"][0]["id"]
        page = client.get("/api/v1/orders/?status=CLOSED").json()["results"]
        cls.order_ids = [o["id"] for o in page]
        cls.refs = [o["ref"] for o in page]
        cls.customer_names = [o["customer_name"] for o in page if o.get("customer_name")]
        client.cookies.clear()


class Customer(HttpUser):
    """A customer on the booking site: browse, book, look at their orders."""

    weight = 5
    wait_time = between(1, 3)

    def on_start(self):
        Catalogue.load(self.client)
        self.phone = f"{next(_phones)}"
        self.tracking = []
        self.client.post(
            "/api/v1/auth/otp/request", json={"phone": self.phone}, name="/auth/otp/request"
        )
        code = self.client.get(
            f"/api/v1/auth/otp/debug?phone={self.phone}", name="/auth/otp/debug"
        ).json()["code"]
        reply = self.client.post(
            "/api/v1/auth/otp/verify",
            json={"phone": self.phone, "code": code},
            name="/auth/otp/verify",
        ).json()
        self.client.headers["Authorization"] = f"Bearer {reply['access']}"

    @task(4)
    def browse(self):
        self.client.get(
            "/api/v1/territory/serviceability?pincode=500027", name="/territory/serviceability"
        )
        self.client.get("/api/v1/catalog/services/", name="/catalog/services")
        self.client.get(
            f"/api/v1/catalog/garment-types/?service={Catalogue.service}&limit=100",
            name="/catalog/garment-types",
        )
        self.client.post(
            "/api/v1/catalog/quote",
            json={
                "hub": Catalogue.hub,
                "service": Catalogue.service,
                "apartment": Catalogue.apartment,
                "is_first_order": True,
                "lines": [
                    {"garment_type": random.choice(Catalogue.garments), "qty": random.randint(1, 5)}
                ],
            },
            name="/catalog/quote",
        )

    @task(2)
    def book(self):
        reply = self.client.post(
            "/api/v1/orders/",
            json={
                "hub": Catalogue.hub,
                "service": Catalogue.service,
                "channel": "WEB",
                "apartment": Catalogue.apartment,
                "flat_no": str(random.randint(101, 1204)),
                "block": random.choice(["A", "B", "C"]),
                "lines": [
                    {"garment_type": g, "qty": random.randint(1, 4)}
                    for g in random.sample(Catalogue.garments, k=min(2, len(Catalogue.garments)))
                ],
            },
            headers={"Idempotency-Key": str(uuid.uuid4())},
            name="/orders [create]",
        )
        if reply.ok:
            self.tracking.append(reply.json()["tracking_token"])

    @task(3)
    def my_orders(self):
        self.client.get("/api/v1/orders/", name="/orders [customer list]")

    @task(2)
    def track(self):
        if self.tracking:
            self.client.get(f"/api/v1/track/{random.choice(self.tracking)}/", name="/track/<token>")


class StaffUser(HttpUser):
    abstract = True
    wait_time = between(1, 3)
    email = "operator@ironman.test"

    def on_start(self):
        Catalogue.load(self.client)
        self.client.cookies.clear()
        self.client.post(
            "/api/v1/auth/login",
            json={"email": self.email, "password": STAFF_PASSWORD},
            name="/auth/login",
        )


class Ops(StaffUser):
    """Operator at the hub: the order board, customers, billing."""

    weight = 3
    email = "operator@ironman.test"

    @task(6)
    def order_board(self):
        self.client.get("/api/v1/orders/", name="/orders [list]")

    @task(3)
    def orders_by_status(self):
        status = random.choice(
            ["SCHEDULED", "PICKUP_ASSIGNED", "AT_HUB", "IN_PRODUCTION", "READY", "OUT_FOR_DELIVERY"]
        )
        self.client.get(f"/api/v1/orders/?status={status}", name="/orders [by status]")

    @task(3)
    def order_search(self):
        term = random.choice(Catalogue.refs[:20] or ["ORD"])
        self.client.get(f"/api/v1/orders/?search={term}", name="/orders [search]")

    @task(3)
    def order_detail(self):
        if Catalogue.order_ids:
            self.client.get(
                f"/api/v1/orders/{random.choice(Catalogue.order_ids)}/", name="/orders/<id>"
            )

    @task(2)
    def customers(self):
        self.client.get("/api/v1/customers/", name="/customers [list]")
        self.client.get(
            f"/api/v1/customers/?search=Load%20Customer%2000{random.randint(10, 99)}",
            name="/customers [search]",
        )

    @task(2)
    def billing(self):
        self.client.get("/api/v1/billing/invoices/", name="/billing/invoices")
        self.client.get(
            "/api/v1/billing/uninvoiced-deliveries", name="/billing/uninvoiced-deliveries"
        )

    @task(1)
    def misc(self):
        self.client.get("/api/v1/notifications/log/", name="/notifications/log")
        self.client.get("/api/v1/order-exceptions/", name="/order-exceptions")
        self.client.get("/api/v1/custody/garment-lines/wip_summary/", name="/custody/wip_summary")


class Founder(StaffUser):
    """Opens the dashboards and the longer reports."""

    weight = 1
    email = "founder@ironman.test"

    @task(5)
    def weekly(self):
        self.client.get("/api/v1/analytics/weekly", name="/analytics/weekly")

    @task(2)
    def reports(self):
        for path in ("apartments", "channels", "unit-economics", "operations", "data-quality"):
            self.client.get(f"/api/v1/analytics/{path}", name=f"/analytics/{path}")

    @task(1)
    def checkpoint(self):
        self.client.get("/api/v1/analytics/checkpoint", name="/analytics/checkpoint")

    @task(1)
    def audit(self):
        self.client.get("/api/v1/identity/audit", name="/identity/audit")
        self.client.get("/api/v1/billing/cash/reconciliation", name="/billing/cash/reconciliation")


class Rider(StaffUser):
    """A rider on the field app: today's jobs."""

    weight = 2
    email = "field@ironman.test"

    @task
    def my_jobs(self):
        self.client.get("/api/v1/fulfilment/jobs/mine/", name="/fulfilment/jobs/mine")


@events.quitting.add_listener
def enforce_targets(environment, **_):
    """Turn the docs/10 targets into an exit code."""
    stats = environment.runner.stats
    problems = []
    total = stats.total
    if total.num_requests and total.fail_ratio > 0.005:
        problems.append(f"error rate {total.fail_ratio:.2%} (limit 0.5%)")
    for entry in stats.entries.values():
        if entry.num_requests < 20:
            continue
        path = entry.name
        is_write = entry.method == "POST" and not path.startswith(
            ("/catalog/quote", "/auth/otp/request")
        )
        p95, p99 = entry.get_response_time_percentile(0.95), entry.get_response_time_percentile(
            0.99
        )
        if any(path.startswith(d) for d in DASHBOARD_PATHS):
            limit = DASHBOARD_MS
            if p95 > limit:
                problems.append(f"{path}: p95 {p95:.0f} ms (dashboard limit {limit})")
        elif path in SLOW_REPORT_PATHS:
            if p95 > SLOW_REPORT_PATHS[path]:
                problems.append(
                    f"{path}: p95 {p95:.0f} ms (report limit {SLOW_REPORT_PATHS[path]})"
                )
        elif is_write:
            if p95 > WRITE_P95_MS:
                problems.append(f"{path}: p95 {p95:.0f} ms (write limit {WRITE_P95_MS})")
        elif p95 > READ_P95_MS or p99 > READ_P99_MS:
            problems.append(
                f"{path}: p95 {p95:.0f} / p99 {p99:.0f} ms (read limits {READ_P95_MS}/{READ_P99_MS})"
            )
    if problems:
        print("\nTARGETS MISSED:\n  " + "\n  ".join(problems))
        environment.process_exit_code = 1
    else:
        print("\nAll docs/10 latency targets met.")

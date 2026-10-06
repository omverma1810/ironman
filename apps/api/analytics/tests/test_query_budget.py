"""The load test (docs/08 batch 7.6) found reports that asked the database a
question per customer: the Day-90 checkpoint made ~7,800 queries at a year of
volume and took 22 seconds. These tests pin the fix in a way that doesn't
depend on guessing a number: growing the data must not grow the query count.
"""

from __future__ import annotations

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext

from analytics import metrics, reports
from analytics.tests.factories import TODAY, WEEK, _delivered
from customers.models import Customer
from fulfilment.models import Job, RouteDay
from growth.models import Attribution


def _more_customers(hub, service, garment_type, apartment, count, offset):
    """`count` new customers, each with a first delivery in the window and a
    repeat order a week later."""
    for i in range(count):
        who = Customer.objects.create(
            hub=hub, name=f"Extra {offset + i}", phone=f"+9198770{offset + i:05d}"
        )
        _delivered(hub, who, service, garment_type, day=WEEK + timedelta(days=1), apt=apartment)
        _delivered(hub, who, service, garment_type, day=WEEK + timedelta(days=5), apt=apartment)


def _queries(fn) -> int:
    with CaptureQueriesContext(connection) as captured:
        fn()
    return len(captured)


def test_report_query_counts_do_not_grow_with_customers(
    week, hub, service, garment_type, apartment
):
    window_end = WEEK + timedelta(days=6)
    reports_under_test = {
        "checkpoint": lambda: reports.checkpoint(hub, TODAY),
        "channel_performance": lambda: reports.channel_performance(hub, WEEK, window_end),
        "apartment_performance": lambda: reports.apartment_performance(hub, WEEK, window_end),
        "repeat_customers": lambda: metrics.repeat_customers(hub, WEEK, window_end),
        "weekly": lambda: metrics.weekly(hub, WEEK, include_money=True),
    }
    before = {name: _queries(fn) for name, fn in reports_under_test.items()}

    _more_customers(hub, service, garment_type, apartment, count=8, offset=0)

    after = {name: _queries(fn) for name, fn in reports_under_test.items()}
    assert after == before


def test_weekly_figures_match_their_drill_down(week, hub):
    """`weekly()` skips building drill-down rows to stay fast; the headline
    figure must be the same one the drill-down arrives at."""
    tiles = {t["key"]: t for t in metrics.weekly(hub, WEEK, include_money=True)["tiles"]}
    for key in metrics.METRICS:
        assert metrics.metric_rows(hub, key, WEEK)["value"] == tiles[key]["value"], key


def test_route_day_and_attribution_lists_do_not_query_per_row(
    api_client, admin_user, hub, cluster, apartment, service, garment_type
):
    api_client.force_authenticate(admin_user)

    def counts():
        return (
            _queries(lambda: api_client.get("/api/v1/fulfilment/route-days/")),
            _queries(lambda: api_client.get("/api/v1/growth/attributions/")),
        )

    def add(n, start):
        for i in range(n):
            day = RouteDay.objects.create(
                hub=hub, cluster=cluster, date=TODAY + timedelta(days=start + i)
            )
            who = Customer.objects.create(
                hub=hub, name=f"Row {start + i}", phone=f"+9198760{start + i:05d}"
            )
            order = _delivered(hub, who, service, garment_type, day=WEEK, apt=apartment)
            Job.objects.create(hub=hub, route_day=day, order=order, kind="PICKUP")

    add(2, 1)
    assert Attribution.objects.count() >= 2
    before = counts()
    add(6, 10)
    assert counts() == before


def test_earlier_weeks_are_cached_on_the_dashboard(week, hub, settings):
    # Keys include the hub's id, which is new for every test, so nothing
    # needs clearing (and a shared cache is never flushed under other workers).
    settings.IRONMAN = {**settings.IRONMAN, "ANALYTICS_PAST_WEEK_CACHE_SECONDS": 60}
    cold = _queries(lambda: metrics.weekly(hub, WEEK, include_money=True))
    first = metrics.weekly(hub, WEEK, include_money=True)
    warm = _queries(lambda: metrics.weekly(hub, WEEK, include_money=True))
    again = metrics.weekly(hub, WEEK, include_money=True)
    assert warm < cold
    assert again == first
    # Switched off, nothing is remembered: the figures are always live.
    settings.IRONMAN = {**settings.IRONMAN, "ANALYTICS_PAST_WEEK_CACHE_SECONDS": 0}
    assert _queries(lambda: metrics.weekly(hub, WEEK, include_money=True)) == cold

"""docs/06 §2 for commission: Admin and Founder see rules, accruals and
settlements; only a Founder edits rules, runs a settlement or marks it
paid. Ops and field staff see none of it."""

from __future__ import annotations

from datetime import date

import pytest
from django.utils import timezone

from growth import commission, services
from growth.models import CommissionBasis, PartnerKind
from ordering.models import Order, OrderStatus

pytestmark = pytest.mark.django_db

RULE = {
    "name": "Watchman standard",
    "basis": CommissionBasis.PER_ORDER,
    "value": 3000,
    "applies_to": "FIRST_ORDER_ONLY",
    "effective_from": "2026-01-01",
    "is_default": True,
}


@pytest.fixture
def accrued(hub, customer, service, admin_user, founder_user):
    partner = services.onboard_partner(
        hub=hub, kind=PartnerKind.WATCHMAN, name="Ramesh", phone="9876500002", actor=admin_user
    )
    code = services.create_referral_code(hub=hub, owner_partner=partner, actor=admin_user)
    commission.create_rule(
        hub=hub,
        name="Std",
        basis=CommissionBasis.PER_ORDER,
        value=3000,
        effective_from=date(2026, 1, 1),
        is_default=True,
        actor=founder_user,
    )
    order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        status=OrderStatus.SCHEDULED,
        referral_code=code.code,
        total_minor=4000,
    )
    services.capture_attribution(order)
    order.status = OrderStatus.DELIVERED
    order.delivered_at = timezone.now()
    order.save(update_fields=["status", "delivered_at"])
    return commission.accrue_for_order(order)


def test_founder_creates_a_rule_and_admin_can_only_read_it(
    api_client, founder_user, admin_user, hub
):
    api_client.force_authenticate(user=founder_user)
    resp = api_client.post(
        "/api/v1/growth/commission-rules/", {"hub": str(hub.id), **RULE}, format="json"
    )
    assert resp.status_code == 201, resp.data
    rule_id = resp.data["id"]

    api_client.force_authenticate(user=admin_user)
    assert api_client.get("/api/v1/growth/commission-rules/").status_code == 200
    assert (
        api_client.post(
            "/api/v1/growth/commission-rules/", {"hub": str(hub.id), **RULE}, format="json"
        ).status_code
        == 403
    )
    assert (
        api_client.patch(
            f"/api/v1/growth/commission-rules/{rule_id}/", {"value": 1}, format="json"
        ).status_code
        == 403
    )


@pytest.mark.parametrize("user_fixture", ["operator_user", "field_user"])
def test_ops_and_field_staff_see_no_commission_data(api_client, request, user_fixture):
    api_client.force_authenticate(user=request.getfixturevalue(user_fixture))
    for url in (
        "/api/v1/growth/commission-rules/",
        "/api/v1/growth/commission-accruals/",
        "/api/v1/growth/settlements/",
    ):
        assert api_client.get(url).status_code == 403, url


def test_admin_sees_balance_and_accruals_but_cannot_settle(api_client, admin_user, accrued):
    api_client.force_authenticate(user=admin_user)
    partner_id = accrued.partner_id
    balance = api_client.get(f"/api/v1/growth/partners/{partner_id}/balance/")
    assert balance.status_code == 200
    assert balance.data["payable_minor"] == 3000
    rows = api_client.get(f"/api/v1/growth/partners/{partner_id}/accruals/")
    assert rows.status_code == 200
    assert (
        api_client.post(
            "/api/v1/growth/settlements/", {"partner": str(partner_id)}, format="json"
        ).status_code
        == 403
    )


def test_founder_settles_pays_and_downloads_the_statement(api_client, founder_user, accrued):
    api_client.force_authenticate(user=founder_user)
    resp = api_client.post(
        "/api/v1/growth/settlements/", {"partner": str(accrued.partner_id)}, format="json"
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["total_minor"] == 3000
    assert resp.data["accrual_count"] == 1
    settlement_id = resp.data["id"]

    paid = api_client.post(
        f"/api/v1/growth/settlements/{settlement_id}/mark-paid/",
        {"payment_method": "UPI", "payment_ref": "UPI998877"},
        format="json",
    )
    assert paid.status_code == 200, paid.data
    assert paid.data["status"] == "PAID"

    pdf = api_client.get(f"/api/v1/growth/settlements/{settlement_id}/statement/")
    assert pdf.status_code == 200
    assert pdf["Content-Type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")

    balance = api_client.get(f"/api/v1/growth/partners/{accrued.partner_id}/balance/")
    assert balance.data["payable_minor"] == 0
    assert balance.data["paid_minor"] == 3000


def test_founder_assigns_a_rule_to_a_partner(api_client, founder_user, admin_user, accrued):
    rule = accrued.rule
    api_client.force_authenticate(user=admin_user)
    url = f"/api/v1/growth/partners/{accrued.partner_id}/commission-rule/"
    assert api_client.post(url, {"commission_rule": str(rule.id)}, format="json").status_code == 403

    api_client.force_authenticate(user=founder_user)
    resp = api_client.post(url, {"commission_rule": str(rule.id)}, format="json")
    assert resp.status_code == 200, resp.data
    assert resp.data["commission_rule"] == rule.id
    assert resp.data["commission_rule_name"] == rule.name


def test_founder_voids_an_accrual_with_a_reason(api_client, founder_user, admin_user, accrued):
    url = f"/api/v1/growth/commission-accruals/{accrued.id}/void/"
    api_client.force_authenticate(user=admin_user)
    assert api_client.post(url, {"reason": "self-referral"}, format="json").status_code == 403
    api_client.force_authenticate(user=founder_user)
    resp = api_client.post(url, {"reason": "self-referral"}, format="json")
    assert resp.status_code == 200, resp.data
    assert resp.data["status"] == "VOID"

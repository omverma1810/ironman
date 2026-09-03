"""docs/06 §3.1 / docs/04 §3.7: issuing is day-to-day Ops-staff handling;
reading the invoice back (list/detail/pdf) is `[C own][Field job][O][A][B]`
— docs/06 §3.1's "View invoice" matrix row, Operator and Field (their own
job's order) included. Recording a payment (batch 3.2) is `[Field job:
CASH/UPI_QR only][O][A][B]`. Credit notes stay `[A]` admin/founder
config-and-correction territory, same reasoning as
`supplies.ConsumptionRuleView`."""

import pytest

pytestmark = pytest.mark.django_db


def test_operator_can_issue_invoice(api_client, operator_user, verified_order):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(f"/api/v1/billing/invoices/{verified_order.id}/issue", {}, format="json")
    assert resp.status_code == 201, resp.data
    assert resp.data["status"] == "ISSUED"


def test_founder_can_issue_invoice(api_client, founder_user, verified_order):
    api_client.force_authenticate(user=founder_user)
    resp = api_client.post(f"/api/v1/billing/invoices/{verified_order.id}/issue", {}, format="json")
    assert resp.status_code == 201, resp.data


def test_field_staff_cannot_issue_invoice(api_client, field_user, verified_order):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(f"/api/v1/billing/invoices/{verified_order.id}/issue", {}, format="json")
    assert resp.status_code == 403


def test_customer_cannot_issue_invoice(api_client, customer_user, verified_order):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post(f"/api/v1/billing/invoices/{verified_order.id}/issue", {}, format="json")
    assert resp.status_code == 403


def test_anonymous_cannot_issue_invoice(api_client, verified_order):
    resp = api_client.post(f"/api/v1/billing/invoices/{verified_order.id}/issue", {}, format="json")
    assert resp.status_code in (401, 403)


def test_operator_can_list_and_read_invoices(api_client, operator_user, verified_order):
    # docs/06 §3.1's own "View invoice" matrix row is `✓` for Operator —
    # the store operator has to know the amount to collect COD. The prose
    # a few lines down ("must not see what the business charges") is about
    # the matrix's *bold* rows (price lists, commission rules, unit
    # economics), not this one.
    from billing.services import issue_invoice

    invoice = issue_invoice(verified_order)
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/billing/invoices/")
    assert resp.status_code == 200, resp.data
    assert len(resp.data["results"]) == 1

    resp = api_client.get(f"/api/v1/billing/invoices/{invoice.ref}/")
    assert resp.status_code == 200


def test_admin_can_list_and_read_invoices(api_client, admin_user, verified_order):
    from billing.services import issue_invoice

    invoice = issue_invoice(verified_order)
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get("/api/v1/billing/invoices/")
    assert resp.status_code == 200, resp.data
    assert len(resp.data["results"]) == 1

    resp = api_client.get(f"/api/v1/billing/invoices/{invoice.ref}/")
    assert resp.status_code == 200
    assert resp.data["ref"] == invoice.ref
    assert "snapshot" in resp.data


def test_founder_can_list_invoices(api_client, founder_user, verified_order):
    from billing.services import issue_invoice

    issue_invoice(verified_order)
    api_client.force_authenticate(user=founder_user)
    resp = api_client.get("/api/v1/billing/invoices/")
    assert resp.status_code == 200


def test_customer_sees_only_their_own_invoice(
    api_client, customer_user, verified_order, hub, service, garment_type
):
    from billing.services import issue_invoice
    from customers.models import Customer

    own_invoice = issue_invoice(verified_order)

    other_customer = Customer.objects.create(hub=hub, phone="+919999912345", name="Someone Else")
    from ordering.models import Order, OrderLine

    other_order = Order.objects.create(
        hub=hub,
        customer=other_customer,
        service=service,
        channel="COUNTER",
        status="INTAKE_VERIFIED",
        declared_total_qty=1,
        verified_total_qty=1,
        subtotal_minor=1500,
        total_minor=1500,
    )
    OrderLine.objects.create(
        hub=hub,
        order=other_order,
        garment_type=garment_type,
        declared_qty=1,
        verified_qty=1,
        unit_price_minor=1500,
        line_total_minor=1500,
    )
    issue_invoice(other_order)

    api_client.force_authenticate(user=customer_user)
    resp = api_client.get("/api/v1/billing/invoices/")
    assert resp.status_code == 200
    refs = {row["ref"] for row in resp.data["results"]}
    assert refs == {own_invoice.ref}

    resp = api_client.get(f"/api/v1/billing/invoices/{own_invoice.ref}/")
    assert resp.status_code == 200


def test_operator_cannot_issue_credit_note(api_client, operator_user, verified_order):
    from billing.services import issue_invoice

    invoice = issue_invoice(verified_order)
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        f"/api/v1/billing/invoices/{invoice.ref}/credit-note/",
        {"reason": "damaged", "amount": 500},
        format="json",
    )
    assert resp.status_code == 403


def test_admin_can_issue_credit_note(api_client, admin_user, verified_order):
    from billing.services import issue_invoice

    invoice = issue_invoice(verified_order)
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        f"/api/v1/billing/invoices/{invoice.ref}/credit-note/",
        {"reason": "damaged", "amount": 500},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["amount_minor"] == 500


def test_admin_can_fetch_pdf_url(api_client, admin_user, verified_order):
    from billing.services import issue_invoice

    invoice = issue_invoice(verified_order)
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get(f"/api/v1/billing/invoices/{invoice.ref}/pdf/")
    assert resp.status_code == 200
    assert resp.data["url"]


def test_field_sees_only_their_own_jobs_invoice(
    api_client, field_user, field_job, verified_order, hub, customer, service, garment_type
):
    from billing.services import issue_invoice
    from ordering.models import Order, OrderLine

    own_invoice = issue_invoice(verified_order)

    other_order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        channel="COUNTER",
        status="INTAKE_VERIFIED",
        declared_total_qty=1,
        verified_total_qty=1,
        subtotal_minor=1500,
        total_minor=1500,
    )
    OrderLine.objects.create(
        hub=hub,
        order=other_order,
        garment_type=garment_type,
        declared_qty=1,
        verified_qty=1,
        unit_price_minor=1500,
        line_total_minor=1500,
    )
    issue_invoice(other_order)  # not field_user's job — must stay invisible

    api_client.force_authenticate(user=field_user)
    resp = api_client.get("/api/v1/billing/invoices/")
    assert resp.status_code == 200, resp.data
    refs = {row["ref"] for row in resp.data["results"]}
    assert refs == {own_invoice.ref}

    resp = api_client.get(f"/api/v1/billing/invoices/{own_invoice.ref}/")
    assert resp.status_code == 200


# ── Payments (batch 3.2) ────────────────────────────────────────────────


def test_operator_can_record_cash_payment(api_client, operator_user, verified_order):
    from billing.services import issue_invoice

    invoice = issue_invoice(verified_order)
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        f"/api/v1/billing/invoices/{invoice.ref}/payments/",
        {"method": "CASH", "amount": 4800, "idempotency_key": "test-key-1"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["amount_minor"] == 4800


def test_field_can_record_cash_payment_for_own_job(
    api_client, field_user, field_job, verified_order
):
    from billing.services import issue_invoice

    invoice = issue_invoice(verified_order)
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        f"/api/v1/billing/invoices/{invoice.ref}/payments/",
        {"method": "CASH", "amount": 4800, "idempotency_key": "test-key-field"},
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_field_cannot_record_adjustment_payment(api_client, field_user, field_job, verified_order):
    from billing.services import issue_invoice

    invoice = issue_invoice(verified_order)
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        f"/api/v1/billing/invoices/{invoice.ref}/payments/",
        {"method": "ADJUSTMENT", "amount": 4800, "idempotency_key": "test-key-adj"},
        format="json",
    )
    assert resp.status_code == 403


def test_field_cannot_record_payment_for_someone_elses_job(api_client, field_user, verified_order):
    # No `field_job` fixture here — field_user has no job on this order.
    from billing.services import issue_invoice

    invoice = issue_invoice(verified_order)
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        f"/api/v1/billing/invoices/{invoice.ref}/payments/",
        {"method": "CASH", "amount": 4800, "idempotency_key": "test-key-notmine"},
        format="json",
    )
    assert resp.status_code == 404  # not in this user's scoped queryset


def test_customer_cannot_record_payment(api_client, customer_user, verified_order):
    from billing.services import issue_invoice

    invoice = issue_invoice(verified_order)
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post(
        f"/api/v1/billing/invoices/{invoice.ref}/payments/",
        {"method": "CASH", "amount": 4800, "idempotency_key": "test-key-cust"},
        format="json",
    )
    assert resp.status_code == 403

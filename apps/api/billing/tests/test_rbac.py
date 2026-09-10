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


# ── Cash custody (batch 3.3) ────────────────────────────────────────────
# docs/06 §3.1: "Own cash balance / handover" is Field(own)/Admin/Founder —
# Operator has no access to *their own* balance/handover (they don't carry
# COD cash), but does confirm *other* people's handovers day-to-day
# (docs/04 `POST .../confirm` is `[A][O]`). Reconciliation (the cross-rider
# variance report) stays Admin/Founder only — narrower than day-to-day
# hub operations.


def test_field_can_view_own_cash_balance(api_client, field_user):
    api_client.force_authenticate(user=field_user)
    resp = api_client.get("/api/v1/billing/cash/mine")
    assert resp.status_code == 200, resp.data
    assert resp.data["balance_minor"] == 0


def test_operator_cannot_view_cash_mine(api_client, operator_user):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/billing/cash/mine")
    assert resp.status_code == 403


def test_field_can_list_handover_recipients(api_client, field_user, operator_user, founder_user):
    api_client.force_authenticate(user=field_user)
    resp = api_client.get("/api/v1/billing/cash/handover-recipients")
    assert resp.status_code == 200, resp.data
    emails = {row["email"] for row in resp.data}
    assert emails == {operator_user.email, founder_user.email}


def test_operator_cannot_list_handover_recipients(api_client, operator_user):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/billing/cash/handover-recipients")
    assert resp.status_code == 403


def test_field_can_initiate_handover(api_client, field_user, operator_user, verified_order):
    from billing.services import issue_invoice, record_payment

    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/billing/cash/handovers/",
        {"to_user": str(operator_user.id), "amount": 2000},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["status"] == "PENDING"
    assert resp.data["declared_amount_minor"] == 2000


def test_operator_cannot_initiate_handover(api_client, operator_user, admin_user):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/billing/cash/handovers/",
        {"to_user": str(admin_user.id), "amount": 100},
        format="json",
    )
    assert resp.status_code == 403


def test_customer_cannot_initiate_handover(api_client, customer_user, operator_user):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post(
        "/api/v1/billing/cash/handovers/",
        {"to_user": str(operator_user.id), "amount": 100},
        format="json",
    )
    assert resp.status_code == 403


def test_operator_can_confirm_handover(api_client, field_user, operator_user, verified_order):
    from billing.services import initiate_handover, issue_invoice, record_payment

    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    handover = initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=2000)

    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        f"/api/v1/billing/cash/handovers/{handover.id}/confirm/",
        {"received_amount": 1950, "note": "short by 50"},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["status"] == "CONFIRMED"
    assert resp.data["variance_minor"] == -50


def test_admin_can_confirm_handover(api_client, field_user, admin_user, verified_order):
    from billing.services import initiate_handover, issue_invoice, record_payment

    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    handover = initiate_handover(from_user=field_user, to_user=admin_user, amount_minor=2000)

    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        f"/api/v1/billing/cash/handovers/{handover.id}/confirm/",
        {"received_amount": 2000},
        format="json",
    )
    assert resp.status_code == 200, resp.data


def test_field_cannot_confirm_handover(api_client, field_user, operator_user, verified_order):
    from billing.services import initiate_handover, issue_invoice, record_payment

    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    handover = initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=2000)

    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        f"/api/v1/billing/cash/handovers/{handover.id}/confirm/",
        {"received_amount": 2000},
        format="json",
    )
    assert resp.status_code == 403


def test_field_sees_only_own_handovers(
    api_client, field_user, operator_user, hub, customer, service, garment_type, verified_order
):
    from billing.services import initiate_handover, issue_invoice, record_payment
    from ordering.models import Order, OrderLine

    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    own = initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=1000)

    other_field = _make_field_user(hub, email="other-field@test.local")
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
    other_invoice = issue_invoice(other_order)
    record_payment(
        other_invoice,
        method="CASH",
        amount_minor=1500,
        idempotency_key="k-other",
        actor=other_field,
    )
    initiate_handover(from_user=other_field, to_user=operator_user, amount_minor=500)

    api_client.force_authenticate(user=field_user)
    resp = api_client.get("/api/v1/billing/cash/handovers/")
    assert resp.status_code == 200
    ids = {row["id"] for row in resp.data}
    assert ids == {str(own.id)}


def test_admin_can_view_reconciliation(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get("/api/v1/billing/cash/reconciliation")
    assert resp.status_code == 200, resp.data


def test_founder_can_view_reconciliation(api_client, founder_user):
    api_client.force_authenticate(user=founder_user)
    resp = api_client.get("/api/v1/billing/cash/reconciliation")
    assert resp.status_code == 200


def test_operator_cannot_view_reconciliation(api_client, operator_user):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/billing/cash/reconciliation")
    assert resp.status_code == 403


def test_field_cannot_view_reconciliation(api_client, field_user):
    api_client.force_authenticate(user=field_user)
    resp = api_client.get("/api/v1/billing/cash/reconciliation")
    assert resp.status_code == 403


def test_operator_can_record_deposit(api_client, field_user, operator_user, verified_order):
    from billing.services import initiate_handover, issue_invoice, record_payment

    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    handover = initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=2000)
    from billing.services import confirm_handover

    confirm_handover(handover, received_amount_minor=2000, actor=operator_user)

    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/billing/cash/deposits/", {"amount": 1000, "reference": "slip-1"}, format="json"
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["amount_minor"] == 1000


def test_field_cannot_record_deposit(api_client, field_user):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post("/api/v1/billing/cash/deposits/", {"amount": 100}, format="json")
    assert resp.status_code == 403


def test_customer_cannot_record_deposit(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post("/api/v1/billing/cash/deposits/", {"amount": 100}, format="json")
    assert resp.status_code == 403


def _make_field_user(hub, *, email):
    from identity.models import Role, RoleCode, User, UserRole

    user = User.objects.create_user(email=email, password="testpass1234")
    role, _ = Role.objects.get_or_create(code=RoleCode.FIELD, defaults={"name": RoleCode.FIELD})
    UserRole.objects.create(user=user, role=role, hub=hub)
    return user


# ── Order cost model (docs/08 batch 3.4) ──────────────────────────────────
# docs/06 §3.1's bold "unit economics / margin" row — Admin/Founder only,
# narrower than "View invoice" (which Operator and a job's own Field rider
# also get — this module's own top-of-file docstring).


def test_admin_can_view_order_costs(api_client, admin_user, verified_order):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get(f"/api/v1/billing/orders/{verified_order.id}/costs")
    assert resp.status_code == 200, resp.data
    assert resp.data["revenue_minor"] == 0
    assert resp.data["contribution_pct"] is None


def test_founder_can_view_order_costs(api_client, founder_user, verified_order):
    api_client.force_authenticate(user=founder_user)
    resp = api_client.get(f"/api/v1/billing/orders/{verified_order.id}/costs")
    assert resp.status_code == 200, resp.data


def test_operator_cannot_view_order_costs(api_client, operator_user, verified_order):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get(f"/api/v1/billing/orders/{verified_order.id}/costs")
    assert resp.status_code == 403


def test_field_cannot_view_order_costs(api_client, field_user, verified_order):
    api_client.force_authenticate(user=field_user)
    resp = api_client.get(f"/api/v1/billing/orders/{verified_order.id}/costs")
    assert resp.status_code == 403


def test_customer_cannot_view_order_costs(api_client, customer_user, verified_order):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.get(f"/api/v1/billing/orders/{verified_order.id}/costs")
    assert resp.status_code == 403


# ── Customer credit ledger (batch 3.6) ─────────────────────────────────────
# docs/04 §3.7's `[C own][A]` — treated the same as every other admin-tier
# view this app already has: Customer for their *own* balance, plus
# Admin/Founder (Founder is unrestricted everywhere Admin is, this session's
# standing convention). Granting credit is Admin/Founder-only config-and-
# correction territory, same tier as credit notes.


def test_customer_can_view_own_credit_balance(api_client, customer_user, customer):
    from billing.services import record_credit

    record_credit(customer, delta_minor=500, reason="GOODWILL")
    api_client.force_authenticate(user=customer_user)
    resp = api_client.get(f"/api/v1/billing/credits/{customer.id}")
    assert resp.status_code == 200, resp.data
    assert resp.data["balance_minor"] == 500
    assert len(resp.data["entries"]) == 1


def test_customer_cannot_view_someone_elses_credit_balance(api_client, customer_user, hub):
    from customers.models import Customer

    other = Customer.objects.create(hub=hub, phone="+919999912398", name="Other Customer")
    api_client.force_authenticate(user=customer_user)
    resp = api_client.get(f"/api/v1/billing/credits/{other.id}")
    assert resp.status_code == 403


def test_admin_can_view_any_customer_credit_balance(api_client, admin_user, customer):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get(f"/api/v1/billing/credits/{customer.id}")
    assert resp.status_code == 200, resp.data
    assert resp.data["balance_minor"] == 0


def test_founder_can_view_any_customer_credit_balance(api_client, founder_user, customer):
    api_client.force_authenticate(user=founder_user)
    resp = api_client.get(f"/api/v1/billing/credits/{customer.id}")
    assert resp.status_code == 200


def test_operator_cannot_view_customer_credit_balance(api_client, operator_user, customer):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get(f"/api/v1/billing/credits/{customer.id}")
    assert resp.status_code == 403


def test_field_cannot_view_customer_credit_balance(api_client, field_user, customer):
    api_client.force_authenticate(user=field_user)
    resp = api_client.get(f"/api/v1/billing/credits/{customer.id}")
    assert resp.status_code == 403


def test_admin_can_grant_credit(api_client, admin_user, customer):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        f"/api/v1/billing/credits/{customer.id}/grant",
        {"reason": "REFERRAL", "amount": 500, "note": "Referred a friend"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["delta_minor"] == 500
    assert resp.data["reason"] == "REFERRAL"


def test_founder_can_grant_credit(api_client, founder_user, customer):
    api_client.force_authenticate(user=founder_user)
    resp = api_client.post(
        f"/api/v1/billing/credits/{customer.id}/grant",
        {"reason": "GOODWILL", "amount": 300},
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_operator_cannot_grant_credit(api_client, operator_user, customer):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        f"/api/v1/billing/credits/{customer.id}/grant",
        {"reason": "GOODWILL", "amount": 300},
        format="json",
    )
    assert resp.status_code == 403


def test_customer_cannot_grant_credit(api_client, customer_user, customer):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post(
        f"/api/v1/billing/credits/{customer.id}/grant",
        {"reason": "GOODWILL", "amount": 300},
        format="json",
    )
    assert resp.status_code == 403


def test_grant_credit_rejects_spend_reason(api_client, admin_user, customer):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        f"/api/v1/billing/credits/{customer.id}/grant",
        {"reason": "SPEND", "amount": 300},
        format="json",
    )
    assert resp.status_code == 400

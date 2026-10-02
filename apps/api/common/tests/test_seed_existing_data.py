"""The demo seed runs against a database that already holds real orders
(the client's testing database is also the production one): it must load
its own data without invoicing, paying or failing on anything else."""

import pytest
from django.core.management import call_command

import billing.services as billing_services
from ordering import services as ordering_services
from ordering.models import OrderStatus
from ordering.state_machine import transition

pytestmark = pytest.mark.django_db


@pytest.fixture
def paid_real_order(hub, customer, service, garment_type, active_price_list, address, apartment):
    order = ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 2}],
        channel="WEB",
        address=address,
        apartment=apartment,
    )
    order.verified_total_qty = 2
    order.save(update_fields=["verified_total_qty"])
    for step in (
        OrderStatus.AT_HUB,
        OrderStatus.INTAKE_VERIFIED,
        OrderStatus.IN_PRODUCTION,
        OrderStatus.READY,
        OrderStatus.DELIVERY_ASSIGNED,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
    ):
        order = transition(order, step)
    order.refresh_from_db()
    invoice = getattr(order, "invoice", None) or billing_services.issue_invoice(order)
    billing_services.record_payment(
        invoice,
        method="CASH",
        amount_minor=billing_services.invoice_balance(invoice),
        idempotency_key="real-payment",
    )
    order.refresh_from_db()
    return transition(order, OrderStatus.CLOSED)


def test_seed_leaves_real_paid_orders_alone(paid_real_order):
    invoice = paid_real_order.invoice
    payments_before = list(invoice.payments.values_list("id", flat=True))

    call_command("seed_demo", stdout=open("/dev/null", "w"))

    invoice.refresh_from_db()
    assert list(invoice.payments.values_list("id", flat=True)) == payments_before
    assert billing_services.invoice_balance(invoice) == 0

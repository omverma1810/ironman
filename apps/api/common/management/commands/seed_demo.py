"""Seeds a realistic pilot scenario: one hub, two clusters, six apartments,
the ironing service catalogue, an active price list, a few staff accounts
and a batch of demo orders spanning most lifecycle states — so the console
UI (Phase 2) has something real to render from the first page load.
"""

from __future__ import annotations

import os
import random
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from catalog.models import GarmentType, Offer, PriceLine, PriceList, Service
from customers.models import Address, Customer
from identity.models import Role, RoleCode, User, UserRole
from notifications.models import ApprovalStatus, NotificationChannel, NotificationTemplate
from ordering import services as ordering_services
from ordering.models import Order, OrderStatus
from territory.models import (
    Apartment,
    Cluster,
    Hub,
    OrderCostSettings,
    RouteDayCapacity,
    ServiceArea,
    TaxSettings,
)

# Local and CI only: the e2e fixtures and the user manual use it, and
# `demo_password` refuses it under production settings.
LOCAL_DEMO_PASSWORD = "IronMan@2026"


def demo_password() -> str:
    """The demo staff password. Locally and in CI it is the documented
    `LOCAL_DEMO_PASSWORD`. Under production settings it must come from the
    DEMO_PASSWORD environment variable: this repository is public, so the
    default must never guard a reachable system."""
    password = os.environ.get("DEMO_PASSWORD", "")
    if password:
        return password
    if settings.SETTINGS_MODULE.endswith(".prod"):
        raise CommandError(
            "Refusing to seed demo staff accounts in production without a private "
            "password: set the DEMO_PASSWORD environment variable."
        )
    return LOCAL_DEMO_PASSWORD


class Command(BaseCommand):
    help = "Seed a demo hub with clusters, apartments, catalogue, staff and orders."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write("Seeding roles...")
        roles = {}
        for code in RoleCode:
            roles[code], _ = Role.objects.get_or_create(code=code, defaults={"name": code.label})

        self.stdout.write("Seeding hub, clusters, apartments...")
        hub, _ = Hub.objects.update_or_create(
            code="HYD-BKP",
            defaults=dict(
                name="IronMan — Barkatpura",
                address="Barkatpura, Kacheguda, Hyderabad, Telangana 500027",
                daily_pressing_capacity=150,
                is_active=True,
            ),
        )
        TaxSettings.objects.update_or_create(
            hub=hub, defaults=dict(gst_enabled=False, default_rate_bps=1800)
        )
        OrderCostSettings.objects.update_or_create(
            hub=hub,
            defaults=dict(
                labour_rate_minor_per_minute=200,  # ~₹2/minute
                press_minutes_per_garment="3.0",
                delivery_allowance_minor_per_job=1500,  # ~₹15/trip, fuel
            ),
        )

        cluster_a, _ = Cluster.objects.update_or_create(
            hub=hub, name="Barkatpura Main Road", defaults={"is_active": True}
        )
        cluster_b, _ = Cluster.objects.update_or_create(
            hub=hub, name="Kacheguda Station Road", defaults={"is_active": True}
        )

        apartment_names = [
            # Fictional buildings in the real service area around the
            # Barkatpura/Kacheguda store (apps/web/lib/landing/content.ts).
            (cluster_a, "Sai Krupa Residency", "500027", "Barkatpura"),
            (cluster_a, "Lakshmi Nilayam Apartments", "500027", "Barkatpura"),
            (cluster_a, "Sri Sai Towers", "500027", "Barkatpura"),
            (cluster_b, "Venkateshwara Enclave", "500027", "Kacheguda"),
            (cluster_b, "Tulsi Heights", "500027", "Kacheguda"),
            (cluster_b, "Narayanguda Residency", "500029", "Narayanguda"),
        ]
        apartments = []
        for i, (cluster, name, pincode, locality) in enumerate(apartment_names):
            apt, _ = Apartment.objects.update_or_create(
                cluster=cluster,
                name=name,
                defaults=dict(
                    # Street-level address only — screens already show the
                    # building name next to it.
                    address=f"{locality}, Hyderabad {pincode}",
                    pincode=pincode,
                    is_active=True,
                    launched_on=timezone.localdate() - timedelta(days=30 - i * 4),
                ),
            )
            apartments.append(apt)

        # `check_serviceability` (batch 4.3's booking wizard, docs/04 §3.2)
        # looks these up by pincode — without a ServiceArea row the wizard's
        # very first step reports every seeded apartment's own pincode as
        # unserviceable.
        for pincode in {"500027", "500029"}:
            ServiceArea.objects.update_or_create(
                hub=hub, pincode=pincode, defaults={"is_active": True}
            )

        self.stdout.write("Seeding catalogue...")
        service, _ = Service.objects.update_or_create(
            code="IRONING",
            defaults=dict(name="Ironing", unit=Service.Unit.PER_ITEM, sla_hours=24, is_active=True),
        )
        garment_specs = [
            ("SHIRT", "Shirt", 1500),
            ("TROUSER", "Trouser", 1800),
            ("SAREE", "Saree", 4000),
            ("KURTA", "Kurta", 2000),
            ("BEDSHEET", "Bedsheet", 3000),
        ]
        garment_types = {}
        for code, name, price in garment_specs:
            gt, _ = GarmentType.objects.update_or_create(
                service=service, code=code, defaults=dict(name=name, is_active=True)
            )
            garment_types[code] = (gt, price)

        price_list = PriceList.objects.filter(
            hub=hub, service=service, status=PriceList.Status.ACTIVE
        ).first()
        if not price_list:
            price_list = PriceList.objects.create(
                hub=hub, service=service, version=1, status=PriceList.Status.DRAFT
            )
            for code, (gt, price) in garment_types.items():
                PriceLine.objects.create(
                    price_list=price_list, garment_type=gt, unit_price_minor=price
                )
            price_list.status = PriceList.Status.ACTIVE
            price_list.effective_from = timezone.now() - timedelta(days=45)
            price_list.save(update_fields=["status", "effective_from"])

        Offer.objects.update_or_create(
            code="FIRST20",
            defaults=dict(
                kind=Offer.Kind.FIRST_ORDER,
                value_bps=2000,
                value_minor=0,
                effective_from=timezone.now() - timedelta(days=60),
                is_active=True,
            ),
        )

        self.stdout.write("Seeding notification templates...")
        # SMS needs no per-template approval, so it's usable immediately —
        # WhatsApp templates start PENDING because there's no real BSP
        # account behind this pilot yet (docs/00 §5 D-05); `notify()`
        # falls back to SMS until a founder flips one to APPROVED.
        sms_templates = {
            "order.scheduled": "Hi {customer_name}, your {service_name} pickup for {order_ref} is scheduled for {pickup_time}. — IronMan",
            "order.out_for_delivery": "Hi {customer_name}, {order_ref} is out for delivery, expected {delivery_time}. Total: {total}. — IronMan",
            "order.delivered": "Hi {customer_name}, {order_ref} has been delivered. Thanks for choosing IronMan!",
            "order.requote_raised": "Hi {customer_name}, the item count for {order_ref} differed from your booking — new total is {total}. Please review and approve in your IronMan account.",
        }
        for code, body in sms_templates.items():
            NotificationTemplate.objects.update_or_create(
                code=code,
                channel=NotificationChannel.SMS,
                locale="en",
                defaults=dict(body=body, variables=["customer_name", "order_ref"]),
            )
            NotificationTemplate.objects.update_or_create(
                code=code,
                channel=NotificationChannel.WHATSAPP,
                locale="en",
                defaults=dict(
                    body=body,
                    variables=["customer_name", "order_ref"],
                    approval_status=ApprovalStatus.PENDING,
                ),
            )

        self.stdout.write("Seeding capacity...")
        today = timezone.localdate()
        windows = [("08:00", "10:00"), ("10:00", "12:00"), ("16:00", "18:00"), ("18:00", "20:00")]
        for cluster in (cluster_a, cluster_b):
            for day_offset in range(14):
                date = today + timedelta(days=day_offset)
                for start, end in windows:
                    for kind in (RouteDayCapacity.Kind.PICKUP, RouteDayCapacity.Kind.DELIVERY):
                        RouteDayCapacity.objects.get_or_create(
                            hub=hub,
                            cluster=cluster,
                            date=date,
                            window_start=start,
                            window_end=end,
                            kind=kind,
                            defaults={"capacity": 12},
                        )

        self.stdout.write("Seeding staff...")
        staff_specs = [
            ("founder@ironman.test", RoleCode.FOUNDER, "Aditi Rao"),
            ("admin@ironman.test", RoleCode.ADMIN, "Rahul Iyer"),
            ("operator@ironman.test", RoleCode.OPERATOR, "Suman Naik"),
            ("field@ironman.test", RoleCode.FIELD, "Vikram Singh"),
        ]
        password = demo_password()
        for email, role_code, name in staff_specs:
            user, created = User.objects.get_or_create(
                email=email,
                defaults=dict(
                    full_name=name,
                    is_staff=True,
                    password=make_password(password),
                    email_verified_at=timezone.now(),
                ),
            )
            if not created and os.environ.get("DEMO_PASSWORD"):
                # Re-seeding with a private password re-keys accounts an
                # earlier run created with the public default.
                user.set_password(password)
                user.save(update_fields=["password"])
            UserRole.objects.get_or_create(user=user, role=roles[role_code], hub=hub)

        # Before the order loop below, which fast-forwards orders straight
        # through custody's PACKED stage (docs/08 batch 3.4's auto-issue
        # hook, `custody.state_machine.transition_garment_line`) — a
        # `ConsumptionRule` created only after those garments already
        # passed PACKED would issue nothing for this seed run.
        self.stdout.write("Seeding supplies...")
        self._seed_supplies(hub, service, garment_types)

        # Before the customer/order loop so some first orders can carry a
        # referral code and exercise attribution capture (batch 5.2).
        self.stdout.write("Seeding growth (partner + referral code)...")
        demo_code = self._seed_growth(hub, apartments)

        self.stdout.write("Seeding customers + demo orders...")
        first_names = [
            "Priya",
            "Arjun",
            "Kavya",
            "Rohan",
            "Ananya",
            "Karthik",
            "Divya",
            "Sanjay",
            "Meera",
            "Vivek",
            "Nisha",
            "Aditya",
        ]
        random.seed(42)
        customers = []
        for i in range(24):
            apt = apartments[i % len(apartments)]
            phone = f"+91987000{i:04d}"
            customer, _ = Customer.objects.get_or_create(
                hub=hub,
                phone=phone,
                defaults=dict(
                    name=f"{first_names[i % len(first_names)]} {['Sharma', 'Reddy', 'Nair', 'Gupta'][i % 4]}",
                    status=Customer.Status.LEAD,
                    acquisition_channel=random.choice(
                        ["WATCHMAN", "WALK_IN", "CUSTOMER_REFERRAL", "ORGANIC"]
                    ),
                    acquisition_apartment=apt,
                ),
            )
            Address.objects.get_or_create(
                customer=customer,
                apartment=apt,
                defaults=dict(flat_no=f"{i % 9 + 1}0{i % 4 + 1}", label="Home", is_default=True),
            )
            customers.append(customer)

        garment_codes = list(garment_types.keys())
        # PICKUP_ASSIGNED/OUT_FOR_DELIVERY appear twice each — someone
        # exploring the field PWA or route-day planning needs several
        # still-untouched pickup/delivery jobs to have anything to do, not
        # just one or two left over after the rest of this list has mostly
        # been driven straight through to DELIVERED/CLOSED.
        demo_states = [
            OrderStatus.SCHEDULED,
            OrderStatus.PICKUP_ASSIGNED,
            OrderStatus.PICKUP_ASSIGNED,
            OrderStatus.AT_HUB,
            OrderStatus.IN_PRODUCTION,
            OrderStatus.READY,
            OrderStatus.OUT_FOR_DELIVERY,
            OrderStatus.OUT_FOR_DELIVERY,
            OrderStatus.DELIVERED,
            OrderStatus.DELIVERED,
            OrderStatus.CLOSED,
            OrderStatus.CANCELLED,
        ]
        founder = User.objects.get(email="founder@ironman.test")
        field_staff = User.objects.get(email="field@ironman.test")
        created_count = 0
        for i, customer in enumerate(customers):
            for j in range(random.randint(1, 3)):
                if Order.objects.filter(customer=customer).count() >= 3:
                    break
                lines = [
                    {"garment_type": garment_types[c][0].id, "qty": random.randint(1, 5)}
                    for c in random.sample(garment_codes, k=random.randint(1, 3))
                ]
                order = ordering_services.create_order(
                    hub=hub,
                    customer=customer,
                    service=service,
                    lines=lines,
                    channel=random.choice(["WEB", "WHATSAPP", "COUNTER"]),
                    # Every fourth customer was brought in by the demo watchman.
                    referral_code=demo_code if (j == 0 and i % 4 == 0) else "",
                    address=customer.addresses.first(),
                    apartment=customer.acquisition_apartment,
                    notes="",
                    actor=founder,
                )
                target = random.choice(demo_states)
                self._fast_forward(order, target, founder, field_staff)
                created_count += 1

        self.stdout.write("Seeding exceptions...")
        exception_count = self._seed_exceptions(hub, founder)

        self.stdout.write("Seeding customer credit...")
        credit_count = self._seed_customer_credit(customers, founder)

        self.stdout.write("Seeding invoices...")
        invoice_count = self._seed_invoices(hub, founder, field_staff)

        self.stdout.write("Seeding cash custody...")
        handover_count = self._seed_cash_custody(hub, field_staff)

        self.stdout.write("Seeding partner commission...")
        accrual_count = self._seed_commission(hub, founder)

        self.stdout.write("Seeding campaigns and spend...")
        self._seed_marketing(hub, apartments, founder)

        self.stdout.write("Seeding lapsed customers...")
        self._seed_lapsed(hub)

        self.stdout.write("Seeding a customer referral...")
        self._seed_customer_referral(
            hub, customers[0], service, garment_types, founder, field_staff
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seed complete: 1 hub, 2 clusters, {len(apartments)} apartments, "
                f"{len(customers)} customers, {created_count} orders, "
                f"{exception_count} exceptions, {invoice_count} invoices, "
                f"{handover_count} cash handovers, {credit_count} credit grants, "
                f"{accrual_count} commission accruals, 4 staff accounts"
                + (
                    "."
                    if os.environ.get("DEMO_PASSWORD")
                    else f" (password: {LOCAL_DEMO_PASSWORD})."
                )
            )
        )

    def _seed_growth(self, hub, apartments) -> str:
        """One watchman with a fixed, memorable code so the booking e2e (and
        anyone exploring the console) has a real referral to use. Idempotent:
        re-seeding reuses the same partner and code."""
        from growth.models import PartnerKind, ReferralCode, ReferralPartner
        from growth.services import create_referral_code, onboard_partner

        existing = ReferralCode.objects.filter(code="DEMOWATCH").first()
        if existing:
            return existing.code
        admin = User.objects.get(email="admin@ironman.test")
        partner = ReferralPartner.objects.filter(hub=hub, name="Ramesh (demo watchman)").first()
        if partner is None:
            partner = onboard_partner(
                hub=hub,
                kind=PartnerKind.WATCHMAN,
                name="Ramesh (demo watchman)",
                phone="9000000001",
                apartment=apartments[0] if apartments else None,
                actor=admin,
            )
        return create_referral_code(
            hub=hub, owner_partner=partner, code="DEMOWATCH", actor=admin
        ).code

    def _seed_commission(self, hub, founder) -> int:
        """docs/08 batches 5.3/5.4: the client's decided default (D-01) — a
        flat ₹30 on a referred customer's first order — as the hub rule,
        then commission for the demo watchman's delivered referrals, and one
        settlement left awaiting payment so a Founder can walk the payout
        end to end.
        Idempotent: the rule, accruals and settlement are each created once.
        """
        from datetime import date

        from growth import commission
        from growth.models import CommissionRule, ReferralPartner, Settlement

        if not CommissionRule.objects.filter(hub=hub).exists():
            commission.create_rule(
                hub=hub,
                name="Watchman — first order",
                basis="PER_ORDER",
                value=3000,
                applies_to="FIRST_ORDER_ONLY",
                effective_from=date(2026, 1, 1),
                is_default=True,
                actor=founder,
            )
        partner = ReferralPartner.objects.filter(hub=hub, name="Ramesh (demo watchman)").first()
        if partner and partner.commission_rule_id is None:
            # The demo watchman is on a per-partner override (₹15 on every
            # order his customers place) so the console shows both kinds of
            # rule — and so his referrals have earned something to settle.
            special = commission.create_rule(
                hub=hub,
                name="Ramesh — every order",
                basis="PER_ORDER",
                value=1500,
                applies_to="ALL_ORDERS",
                effective_from=date(2026, 1, 1),
                actor=founder,
            )
            commission.assign_rule(partner, special, actor=founder)
        if partner and not partner.accruals.exists():
            self._attach_demo_referrals(hub, partner)
        commission.backfill_accruals(hub, actor=founder)

        if partner and not Settlement.objects.filter(partner=partner).exists():
            if commission.partner_balance(partner)["accrued_minor"] > 0:
                commission.create_settlement(partner, actor=founder)
        return partner.accruals.count() if partner else 0

    def _seed_marketing(self, hub, apartments, founder) -> None:
        """docs/08 batch 5.6: a flyer drop at one apartment and an
        influencer post, each with spend entered, so the Marketing page
        shows cost per new customer from real rows. Idempotent: skipped once
        the hub has any campaign."""
        from datetime import timedelta

        from growth import marketing
        from growth.models import Campaign

        if Campaign.objects.filter(hub=hub).exists():
            return
        today = timezone.localdate()
        flyers = marketing.create_campaign(
            hub=hub,
            name=f"Flyers — {apartments[0].name}" if apartments else "Flyers",
            channel="FLYER",
            apartment=apartments[0] if apartments else None,
            start_on=today - timedelta(days=28),
            objective="20 first orders from the building",
            actor=founder,
        )
        marketing.record_spend(
            flyers,
            amount_minor=180000,
            category="PRINT",
            spent_on=today - timedelta(days=28),
            note="600 flyers, printed and distributed",
            actor=founder,
        )
        reel = marketing.create_campaign(
            hub=hub,
            name="Instagram reel — local food blogger",
            channel="INFLUENCER",
            start_on=today - timedelta(days=12),
            objective="Awareness across Barkatpura and Kacheguda",
            actor=founder,
        )
        marketing.record_spend(
            reel,
            amount_minor=400000,
            category="INFLUENCER",
            spent_on=today - timedelta(days=12),
            note="One reel + two stories",
            actor=founder,
        )

    def _seed_lapsed(self, hub, count: int = 4) -> None:
        """docs/08 batch 5.7: every demo order is delivered "today", so
        nobody would ever look lapsed. Move a few customers' deliveries back
        five to seven weeks — customers with nothing still in progress — so
        the Lapsed customers page has people to win back. Idempotent: picks
        no one once enough customers already look lapsed."""
        from datetime import timedelta

        from growth.reengagement import lapsed_customers

        missing = count - len(lapsed_customers(hub, days=30))
        if missing <= 0:
            return
        done = [OrderStatus.DELIVERED, OrderStatus.CLOSED]
        settled = done + [OrderStatus.CANCELLED]
        candidates = (
            Customer.objects.filter(hub=hub, orders__status__in=done)
            .exclude(orders__status__in=[s for s in OrderStatus.values if s not in settled])
            .distinct()
            .order_by("phone")[:missing]
        )
        for weeks, customer in enumerate(candidates, start=5):
            Order.objects.filter(customer=customer, status__in=done).update(
                delivered_at=timezone.now() - timedelta(weeks=weeks)
            )

    def _seed_customer_referral(
        self, hub, referrer, service, garment_types, founder, field_staff
    ) -> None:
        """docs/08 batch 5.5: one customer has shared their code, and the
        friend who booked with it has had a first order delivered — so both
        hold referral credit and the console's rewards list isn't empty.
        Idempotent: does nothing once the hub has any referral reward."""
        from growth import referrals
        from growth.models import CustomerReferralReward

        if CustomerReferralReward.objects.filter(hub=hub).exists():
            return
        code = referrals.customer_code(referrer).code
        friend, _ = Customer.objects.get_or_create(
            hub=hub,
            phone="+919870009001",
            defaults={
                "name": "Kavya Reddy",
                "acquisition_apartment": referrer.acquisition_apartment,
            },
        )
        order = Order.objects.filter(customer=friend).order_by("created_at").first()
        if order is None:
            first_type = next(iter(garment_types.values()))[0]
            order = ordering_services.create_order(
                hub=hub,
                customer=friend,
                service=service,
                lines=[{"garment_type": first_type.id, "qty": 4}],
                channel="WEB",
                referral_code=code,
                apartment=friend.acquisition_apartment,
                notes="",
                actor=founder,
            )
            self._fast_forward(order, OrderStatus.DELIVERED, founder, field_staff)
            order.refresh_from_db()
        referrals.reward_for_order(order, actor=founder)

    def _attach_demo_referrals(self, hub, partner, count: int = 3) -> None:
        """Which seeded customers end up with a delivered order is down to
        the random states above, so the demo watchman may have no delivered
        referral at all. Record his code on a few delivered orders instead,
        exactly as `capture_attribution` does when a returning customer
        types a code at booking (a non-first-touch row)."""
        from growth.models import Attribution, ChannelCode, ReferralCode
        from growth.services import get_channel

        code = ReferralCode.objects.filter(owner_partner=partner).first()
        attributed = Attribution.objects.filter(partner__isnull=False).values_list(
            "order_id", flat=True
        )
        orders = (
            Order.objects.filter(hub=hub, status__in=[OrderStatus.DELIVERED, OrderStatus.CLOSED])
            .exclude(pk__in=attributed)
            .order_by("created_at")[:count]
        )
        channel = get_channel(ChannelCode.WATCHMAN)
        for order in orders:
            Attribution.objects.create(
                hub=hub,
                customer=order.customer,
                order=order,
                channel=channel,
                apartment=order.apartment,
                partner=partner,
                referral_code=code,
                is_first_touch=False,
                basis="CODE",
            )

    def _seed_customer_credit(self, customers, founder) -> int:
        """docs/08 batch 3.6: gives the credit ledger real rows on first
        load — a referral reward for every customer who actually came in
        via `CUSTOMER_REFERRAL`, plus a goodwill gesture on a couple of
        others — so the customer detail "Store credit" section and the
        Admin/Founder grant-credit dialog both have real data rather than
        an empty state. Runs before `_seed_invoices` so some of these
        balances get spent there too (docs/08 3.6's CREDIT payment method).
        """
        import billing.services as billing_services
        from billing.models import CreditReason

        count = 0
        for i, customer in enumerate(customers):
            if customer.acquisition_channel == "CUSTOMER_REFERRAL":
                billing_services.record_credit(
                    customer,
                    delta_minor=random.choice([300, 500, 800]),
                    reason=CreditReason.REFERRAL,
                    actor=founder,
                    note="Referral reward",
                )
                count += 1
            elif i % 5 == 0:
                billing_services.record_credit(
                    customer,
                    delta_minor=200,
                    reason=CreditReason.GOODWILL,
                    actor=founder,
                    note="Goodwill gesture — service delay",
                )
                count += 1
        return count

    def _seed_invoices(self, hub, issuer, collector) -> int:
        """docs/08 Phase 3 exit criterion: "every delivered order has an
        invoice" — so every DELIVERED/CLOSED order in `demo_states` above
        gets one, not just a sample, and the console's Invoices screen
        (Admin/Founder) has real rows on first load.

        Payments (batch 3.2) are seeded in the same pass so the screen
        shows every real state, not just ISSUED: `CLOSED` requires
        `payment_status = PAID` (`docs/02 §5` invariant #4), while
        `DELIVERED` is routinely still `UNPAID` — "COD not yet handed over
        by the rider" is normal, not a bug (`docs/01 §5.2`) — so only some
        DELIVERED orders get a payment, and some of those only a partial
        one.

        `collector` (the field rider), not `issuer` (founder), is who
        actually collects CASH/UPI at the door — `record_payment`'s
        `collected_by` needs to be the rider for `_seed_cash_custody`
        (batch 3.3) to have a real balance to seed a handover from.

        Only the demo hub's orders: the seed also runs against a database
        that already holds real orders, and must never invoice or pay those.
        """
        import billing.services as billing_services

        count = 0
        orders = Order.objects.filter(
            hub=hub,
            status__in=[OrderStatus.DELIVERED, OrderStatus.CLOSED],
            verified_total_qty__isnull=False,
        )
        for order in orders:
            # Delivering an order (done above through the real fulfilment
            # services) now issues its invoice automatically, so by the
            # time we get here the invoice usually already exists — issue
            # only if it doesn't, but still seed its payments below.
            invoice = getattr(order, "invoice", None)
            if invoice is None:
                invoice = billing_services.issue_invoice(order, actor=issuer)
            elif invoice.payments.filter(
                idempotency_key__startswith=f"seed-{invoice.ref}"
            ).exists():
                continue  # already seeded on an earlier run
            count += 1

            # Spend down whatever store credit `_seed_customer_credit`
            # already granted this customer, if any — unconditionally, on
            # *both* branches below, so the CREDIT payment method (batch
            # 3.6) always has at least one real row rather than depending
            # on luck across a small demo dataset.
            # Never more than is still owed: an invoice can already be part
            # or fully settled (store credit applied, a payment taken in the
            # console) by the time the seed reaches it.
            owed = billing_services.invoice_balance(invoice)
            if owed <= 0:
                continue
            credit_balance = billing_services.customer_credit_balance(order.customer)
            credit_used = min(credit_balance, owed)
            if credit_used > 0:
                billing_services.record_payment(
                    invoice,
                    method="CREDIT",
                    amount_minor=credit_used,
                    idempotency_key=f"seed-{invoice.ref}-credit",
                    actor=collector,
                )

            if order.status == OrderStatus.CLOSED:
                remaining = owed - credit_used
                if remaining > 0:
                    billing_services.record_payment(
                        invoice,
                        method="CASH",
                        amount_minor=remaining,
                        idempotency_key=f"seed-{invoice.ref}-full",
                        actor=collector,
                    )
            elif credit_used == 0 and random.random() < 0.6:
                partial = max(1, owed // 2)
                billing_services.record_payment(
                    invoice,
                    method=random.choice(["CASH", "UPI_QR"]),
                    amount_minor=partial,
                    idempotency_key=f"seed-{invoice.ref}-partial",
                    actor=collector,
                )
        return count

    def _seed_cash_custody(self, hub, field_staff) -> int:
        """docs/08 batch 3.3 / docs/00 G-5: gives the reconciliation screen
        real rows on first load rather than an empty state. Deliberately
        leaves the rider's balance *not* fully cleared and one handover
        still `PENDING` — an operator exploring the console should see
        both "needs confirming" and "already reconciled with a small
        variance" on the very first load, not just a tidy zero.
        """
        import billing.services as billing_services

        operator = User.objects.get(email="operator@ironman.test")
        balance = billing_services.cash_balance(field_staff)
        if balance < 200:
            return 0

        count = 0
        # First chunk: confirmed with a small shortfall, so the
        # reconciliation table has a real (non-zero) variance to show.
        first_declared = balance // 2
        first = billing_services.initiate_handover(
            from_user=field_staff, to_user=operator, amount_minor=first_declared
        )
        shortfall = min(50, first_declared)
        billing_services.confirm_handover(
            first, received_amount_minor=first_declared - shortfall, actor=operator
        )
        count += 1

        # Second chunk: left PENDING — the operator console's "confirm"
        # action needs something real to act on.
        remaining = billing_services.cash_balance(field_staff)
        if remaining >= 100:
            billing_services.initiate_handover(
                from_user=field_staff, to_user=operator, amount_minor=remaining // 2
            )
            count += 1

        # Bank part of what's been confirmed, leaving some hub cash on
        # hand too — "record deposit" has a real available balance to act on.
        on_hand = billing_services.hub_cash_on_hand(hub)
        if on_hand >= 100:
            billing_services.record_deposit(
                hub, amount_minor=on_hand // 2, actor=operator, reference="seed-deposit-1"
            )
        return count

    def _seed_supplies(self, hub, service, garment_types):
        """docs/08 batch 2.13: enough stock rows that the console screen has
        both a healthy item and one already at/under its reorder line
        (`HANGER-001`, deliberately received below its own reorder_level) —
        an all-green board doesn't exercise the reorder-alerts view at
        all. Consumption rules mirror docs/02 §3.9's own example: a hanger
        and a poly cover per shirt or trouser."""
        import supplies.services as supplies_services
        from supplies.models import ConsumptionRule, StockCategory, StockItem, StockUnit

        operator = User.objects.get(email="operator@ironman.test")

        item_specs = [
            ("HANGER-001", "Wire hanger", StockCategory.HANGER, StockUnit.PIECE, 200, 40, 300),
            ("COVER-001", "Poly garment cover", StockCategory.COVER, StockUnit.PIECE, 300, 25, 800),
            ("BAG-001", "Delivery bag", StockCategory.BAG, StockUnit.PIECE, 50, 15, 120),
            (
                "SPOT-001",
                "Spot-cleaning solvent",
                StockCategory.CHEMICAL,
                StockUnit.LITRE,
                5,
                220,
                10,
            ),
        ]
        stock_items = {}
        already_seeded = []
        for sku, name, category, unit, reorder_level, unit_cost, receive_qty in item_specs:
            item, _ = StockItem.objects.update_or_create(
                hub=hub,
                sku=sku,
                defaults=dict(name=name, category=category, unit=unit, reorder_level=reorder_level),
            )
            stock_items[sku] = item
            # A level now exists from item creation, so the ledger is the
            # only honest "has this been received yet" signal.
            already_seeded.append(item.movements.exists())

        # The receipt + issue/wastage movements below are a single batch,
        # seeded together the first time this command runs against a hub —
        # `receive_stock`/`adjust_stock` write append-only ledger rows, so
        # re-running the batch on a re-seed would double the balance (or,
        # for the issues, eventually try to remove more than is on hand).
        # `StockItem` rows themselves stay `update_or_create`-idempotent
        # above regardless.
        if not all(already_seeded):
            for sku, _name, _category, _unit, _reorder_level, unit_cost, receive_qty in item_specs:
                supplies_services.receive_stock(
                    stock_items[sku],
                    qty=receive_qty,
                    unit_cost_minor=unit_cost,
                    supplier="Hyderabad Packaging Co.",
                    invoice_ref="INV-2026-0142",
                    actor=operator,
                )
            # A little wear on the healthy items, and enough issued against
            # the hanger stock to leave it sitting at/under its own reorder
            # line (see the docstring above).
            supplies_services.adjust_stock(
                stock_items["HANGER-001"],
                delta=-270,
                kind="ISSUE",
                note="packed shirts",
                actor=operator,
            )
            supplies_services.adjust_stock(
                stock_items["COVER-001"],
                delta=-40,
                kind="ISSUE",
                note="packed shirts",
                actor=operator,
            )
            supplies_services.adjust_stock(
                stock_items["SPOT-001"], delta=-1, kind="WASTAGE", note="spill", actor=operator
            )

        for code in ("SHIRT", "TROUSER"):
            gt, _price = garment_types[code]
            ConsumptionRule.objects.update_or_create(
                service=service,
                garment_type=gt,
                stock_item=stock_items["HANGER-001"],
                defaults={"qty_per_unit": 1},
            )
            ConsumptionRule.objects.update_or_create(
                service=service,
                garment_type=gt,
                stock_item=stock_items["COVER-001"],
                defaults={"qty_per_unit": 1},
            )

    def _seed_exceptions(self, hub, founder):
        """A handful of exceptions across the triage queue's real states
        (docs/08 batch 2.9) — an empty queue tells you nothing about
        whether the SLA/assignment/resolution flow actually works."""
        from ordering.models import Order, OrderException

        orders = list(Order.objects.filter(hub=hub).order_by("?")[:4])
        if len(orders) < 4:
            return 0
        admin = User.objects.get(email="admin@ironman.test")
        operator = User.objects.get(email="operator@ironman.test")
        now = timezone.now()

        specs = [
            dict(
                order=orders[0],
                kind="DAMAGED",
                severity="HIGH",
                status="OPEN",
                description="Silk saree came back with a scorch mark near the pallu.",
                raised_by=operator,
                sla_due_at=now - timezone.timedelta(hours=6),  # overdue, on purpose
            ),
            dict(
                order=orders[1],
                kind="MISSING",
                severity="MEDIUM",
                status="INVESTIGATING",
                description="Customer says one shirt short of the delivered count.",
                raised_by=operator,
                assigned_to=admin,
                sla_due_at=now + timezone.timedelta(days=1),
            ),
            dict(
                order=orders[2],
                kind="WRONG_ITEM",
                severity="LOW",
                status="RESOLVED",
                description="Delivered a trouser belonging to a different order in the same bag.",
                raised_by=operator,
                assigned_to=operator,
                sla_due_at=now - timezone.timedelta(days=2),
                resolution="Correct item picked up and swapped same day; customer confirmed.",
                resolved_at=now - timezone.timedelta(days=1),
            ),
            dict(
                order=orders[3],
                kind="LOST",
                severity="HIGH",
                status="WRITTEN_OFF",
                description="Garment never located after a hub relocation mix-up.",
                raised_by=founder,
                assigned_to=founder,
                sla_due_at=now - timezone.timedelta(days=5),
                resolution="Untraceable after 5 days; goodwill credit issued to customer.",
                resolved_at=now - timezone.timedelta(days=3),
                cost_minor=150000,
            ),
        ]
        for spec in specs:
            OrderException.objects.get_or_create(
                hub=hub, order=spec["order"], kind=spec["kind"], defaults=spec
            )
        return len(specs)

    # Targets whose path reaches at least PICKUP_ASSIGNED / DELIVERY_ASSIGNED
    # — everything except the two ends of the lifecycle (still-just-booked,
    # and cancelled before anyone was ever dispatched).
    _NEEDS_PICKUP = {
        OrderStatus.PICKUP_ASSIGNED,
        OrderStatus.AT_HUB,
        OrderStatus.IN_PRODUCTION,
        OrderStatus.READY,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
        OrderStatus.CLOSED,
    }
    _NEEDS_DELIVERY = {OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED, OrderStatus.CLOSED}
    _NEEDS_PRODUCTION = {
        OrderStatus.IN_PRODUCTION,
        OrderStatus.READY,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
        OrderStatus.CLOSED,
    }

    def _fast_forward(self, order, target, actor, field_staff):
        """Drive a freshly-created order through the state machine to a
        target demo state, taking a plausible path rather than jumping
        straight there — every OrderEvent this writes is real. The
        pickup/delivery legs go through real `fulfilment` Jobs (not a raw
        `transition()` injection like the rest of this path) so the
        route-day planning screen and the production board tell the same
        story about the same orders."""
        from ordering.state_machine import transition

        if order.status == OrderStatus.PENDING_CONFIRMATION:
            order = transition(
                order, OrderStatus.SCHEDULED, actor=actor, event_type="seed.confirmed"
            )

        if target in self._NEEDS_PICKUP:
            order = self._seed_pickup_job(order, target, actor, field_staff)

        production_path = {
            OrderStatus.IN_PRODUCTION: [OrderStatus.IN_PRODUCTION],
            OrderStatus.READY: [OrderStatus.IN_PRODUCTION, OrderStatus.READY],
        }
        # OUT_FOR_DELIVERY/DELIVERED/CLOSED all pass through READY first.
        steps = production_path.get(target, production_path[OrderStatus.READY])
        if target in self._NEEDS_PRODUCTION:
            # Real `record_intake`, not an injected `transition()` — this
            # is also what sets `verified_total_qty`/`subtotal_minor`/
            # `total_minor` from verified quantities (docs/02 §3.5), which
            # `billing.services.issue_invoice` requires before an order can
            # be invoiced. No variance seeded: every declared line verifies
            # as declared.
            verified_lines = [
                {"garment_type": line.garment_type_id, "qty": line.declared_qty}
                for line in order.lines.all()
            ]
            order = ordering_services.record_intake(
                order, verified_lines=verified_lines, actor=actor
            )
            for step in steps:
                order = transition(order, step, actor=actor, event_type=f"seed.{step.lower()}")
            self._seed_bag(order, target, actor)

        if target in self._NEEDS_DELIVERY:
            order = self._seed_delivery_job(order, target, actor, field_staff)

        if target == OrderStatus.CANCELLED:
            order = transition(
                order, OrderStatus.CANCELLED, actor=actor, event_type="seed.cancelled"
            )

        if target == OrderStatus.CLOSED:
            order.payment_status = "PAID"
            order.save(update_fields=["payment_status"])
            transition(order, OrderStatus.CLOSED, actor=actor, event_type="seed.closed")

    def _seed_pickup_job(self, order, target, actor, field_staff):
        """PICKUP_ASSIGNED, and — for any target beyond it — through to
        AT_HUB, via a real RouteDay + Job rather than an injected order
        transition (docs/02 §3.7)."""
        import fulfilment.services as fulfilment_services

        cluster = order.apartment.cluster
        # `pickup_slot_start` round-trips through the DB and comes back
        # UTC-represented (Django always returns DateTimeField values in
        # UTC, regardless of TIME_ZONE) — plain `.date()` on it silently
        # takes the UTC calendar date, while fulfilment's `jobs/mine/`
        # (what field.spec.ts's "today's jobs" reads) filters on
        # `timezone.localdate()` (IST). They disagree for ~5.5h daily
        # (UTC 18:30-24:00, when IST has already rolled to tomorrow) —
        # same class of bug as ordering/tests' test_due_filter_today fix.
        date = (
            timezone.localtime(order.pickup_slot_start).date()
            if order.pickup_slot_start
            else timezone.localdate()
        )
        route_day = fulfilment_services.create_route_day(
            hub=order.hub, cluster=cluster, date=date, actor=actor
        )
        fulfilment_services.assign_route_day(
            route_day,
            staff_ids=[field_staff.id],
            jobs=[{"order_id": order.id, "kind": "PICKUP", "assigned_to": field_staff.id}],
            actor=actor,
        )
        order.refresh_from_db()
        if target == OrderStatus.PICKUP_ASSIGNED:
            return order

        job = order.jobs.get(kind="PICKUP")
        fulfilment_services.start_job(job, actor=actor)
        fulfilment_services.complete_job(job, declared_lines=[], actor=actor)
        order.refresh_from_db()
        return order

    def _seed_delivery_job(self, order, target, actor, field_staff):
        """DELIVERY_ASSIGNED, and — for DELIVERED/CLOSED — through to
        DELIVERED, scanning the order's own seeded bag as proof."""
        import fulfilment.services as fulfilment_services

        cluster = order.apartment.cluster
        route_day = fulfilment_services.create_route_day(
            hub=order.hub, cluster=cluster, date=timezone.localdate(), actor=actor
        )
        fulfilment_services.assign_route_day(
            route_day,
            staff_ids=[field_staff.id],
            jobs=[{"order_id": order.id, "kind": "DELIVERY", "assigned_to": field_staff.id}],
            actor=actor,
        )
        order.refresh_from_db()
        job = order.jobs.get(kind="DELIVERY")
        fulfilment_services.start_job(job, actor=actor)
        if target == OrderStatus.OUT_FOR_DELIVERY:
            order.refresh_from_db()
            return order

        bag = order.bags.first()
        fulfilment_services.complete_job(job, bag_codes=[bag.code], actor=actor)
        order.refresh_from_db()
        return order

    # docs/01 §5.3 — how far a bag's garments travel tracks how far the
    # order itself got, so the production board and this order's own
    # timeline tell the same story.
    _BAG_PATH_BY_ORDER_TARGET = {
        OrderStatus.IN_PRODUCTION: ["SORTED", "PRESSING"],
        OrderStatus.READY: ["SORTED", "PRESSING", "PRESSED", "QC", "PACKED"],
        OrderStatus.OUT_FOR_DELIVERY: [
            "SORTED",
            "PRESSING",
            "PRESSED",
            "QC",
            "PACKED",
            "DISPATCHED",
        ],
        OrderStatus.DELIVERED: [
            "SORTED",
            "PRESSING",
            "PRESSED",
            "QC",
            "PACKED",
            "DISPATCHED",
            "DELIVERED",
        ],
        OrderStatus.CLOSED: [
            "SORTED",
            "PRESSING",
            "PRESSED",
            "QC",
            "PACKED",
            "DISPATCHED",
            "DELIVERED",
        ],
    }

    def _seed_bag(self, order, target, actor):
        import custody.services as custody_services
        from custody.state_machine import transition_bag

        bag = custody_services.create_bag_for_order(order, actor=actor)
        for stage in self._BAG_PATH_BY_ORDER_TARGET.get(target, []):
            transition_bag(bag, stage, actor=actor, station="seed")

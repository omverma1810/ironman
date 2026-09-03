"""Seeds a realistic pilot scenario: one hub, two clusters, six apartments,
the ironing service catalogue, an active price list, a few staff accounts
and a batch of demo orders spanning most lifecycle states — so the console
UI (Phase 2) has something real to render from the first page load.
"""

from __future__ import annotations

import random
from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from catalog.models import GarmentType, Offer, PriceLine, PriceList, Service
from customers.models import Address, Customer
from identity.models import Role, RoleCode, User, UserRole
from ordering import services as ordering_services
from ordering.models import Order, OrderStatus
from territory.models import Apartment, Cluster, Hub, RouteDayCapacity, TaxSettings


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
            code="BLR-KOR",
            defaults=dict(
                name="IronMan — Koramangala",
                address="80 Feet Road, Koramangala, Bengaluru",
                daily_pressing_capacity=150,
                is_active=True,
            ),
        )
        TaxSettings.objects.update_or_create(
            hub=hub, defaults=dict(gst_enabled=False, default_rate_bps=1800)
        )

        cluster_a, _ = Cluster.objects.update_or_create(
            hub=hub, name="Koramangala 4th Block", defaults={"is_active": True}
        )
        cluster_b, _ = Cluster.objects.update_or_create(
            hub=hub, name="Koramangala 5th Block", defaults={"is_active": True}
        )

        apartment_names = [
            (cluster_a, "Prestige Lakeside Habitat", "560095"),
            (cluster_a, "Adarsh Palm Retreat", "560095"),
            (cluster_a, "Sobha Silicon Oasis", "560095"),
            (cluster_b, "Purva Skywood", "560034"),
            (cluster_b, "Brigade Meadows", "560034"),
            (cluster_b, "Salarpuria Sattva Greenage", "560034"),
        ]
        apartments = []
        for i, (cluster, name, pincode) in enumerate(apartment_names):
            apt, _ = Apartment.objects.update_or_create(
                cluster=cluster,
                name=name,
                defaults=dict(
                    address=f"{name}, Koramangala",
                    pincode=pincode,
                    is_active=True,
                    launched_on=timezone.localdate() - timedelta(days=30 - i * 4),
                ),
            )
            apartments.append(apt)

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
        for email, role_code, name in staff_specs:
            user, created = User.objects.get_or_create(
                email=email,
                defaults=dict(
                    full_name=name,
                    is_staff=True,
                    password=make_password("IronMan@2026"),
                    email_verified_at=timezone.now(),
                ),
            )
            UserRole.objects.get_or_create(user=user, role=roles[role_code], hub=hub)

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

        self.stdout.write("Seeding supplies...")
        self._seed_supplies(hub, service, garment_types)

        self.stdout.write("Seeding invoices...")
        invoice_count = self._seed_invoices(founder)

        self.stdout.write(
            self.style.SUCCESS(
                f"Seed complete: 1 hub, 2 clusters, {len(apartments)} apartments, "
                f"{len(customers)} customers, {created_count} orders, "
                f"{exception_count} exceptions, {invoice_count} invoices, "
                "4 staff accounts (password: IronMan@2026)."
            )
        )

    def _seed_invoices(self, actor) -> int:
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
        """
        import billing.services as billing_services

        count = 0
        orders = Order.objects.filter(
            status__in=[OrderStatus.DELIVERED, OrderStatus.CLOSED], verified_total_qty__isnull=False
        )
        for order in orders:
            if hasattr(order, "invoice"):
                continue
            invoice = billing_services.issue_invoice(order, actor=actor)
            count += 1

            if order.status == OrderStatus.CLOSED:
                billing_services.record_payment(
                    invoice,
                    method="CASH",
                    amount_minor=invoice.total_minor,
                    idempotency_key=f"seed-{invoice.ref}-full",
                    actor=actor,
                )
            elif random.random() < 0.6:
                partial = max(1, invoice.total_minor // 2)
                billing_services.record_payment(
                    invoice,
                    method=random.choice(["CASH", "UPI_QR"]),
                    amount_minor=partial,
                    idempotency_key=f"seed-{invoice.ref}-partial",
                    actor=actor,
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
            already_seeded.append(hasattr(item, "level"))

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
                    supplier="Bangalore Packaging Co.",
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
        date = order.pickup_slot_start.date() if order.pickup_slot_start else timezone.localdate()
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

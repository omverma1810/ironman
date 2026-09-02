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
                    name=f"{first_names[i % len(first_names)]} {['Sharma','Reddy','Nair','Gupta'][i % 4]}",
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
                defaults=dict(flat_no=f"{i%9+1}0{i%4+1}", label="Home", is_default=True),
            )
            customers.append(customer)

        garment_codes = list(garment_types.keys())
        demo_states = [
            OrderStatus.SCHEDULED,
            OrderStatus.PICKUP_ASSIGNED,
            OrderStatus.AT_HUB,
            OrderStatus.IN_PRODUCTION,
            OrderStatus.READY,
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

        self.stdout.write(
            self.style.SUCCESS(
                f"Seed complete: 1 hub, 2 clusters, {len(apartments)} apartments, "
                f"{len(customers)} customers, {created_count} orders, 4 staff accounts "
                f"(password: IronMan@2026)."
            )
        )

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
            OrderStatus.IN_PRODUCTION: [OrderStatus.INTAKE_VERIFIED, OrderStatus.IN_PRODUCTION],
            OrderStatus.READY: [
                OrderStatus.INTAKE_VERIFIED,
                OrderStatus.IN_PRODUCTION,
                OrderStatus.READY,
            ],
        }
        # OUT_FOR_DELIVERY/DELIVERED/CLOSED all pass through READY first.
        steps = production_path.get(target, production_path[OrderStatus.READY])
        if target in self._NEEDS_PRODUCTION:
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

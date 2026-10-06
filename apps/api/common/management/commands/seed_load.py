"""Scales a seeded local database up to a year of pilot volume, for the load
test (docs/08 batch 7.6, docs/10 NFR-11).

Run `seed_demo` first (it creates the hub, catalogue and staff), then this.
Rows are bulk-inserted rather than driven through the order services: the
point is realistic table sizes and data shapes for the indexes and queries
to be measured against, and 36,000 orders through the services would take
hours. Because it bypasses the services it is for throwaway databases only
and refuses to run under production settings.
"""

from __future__ import annotations

import random
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from billing.models import Invoice, InvoiceStatus, Payment, PaymentMethod
from billing.models import PaymentStatus as PaymentRowStatus
from catalog.models import PriceLine, PriceList, Service
from customers.models import Address, Customer
from fulfilment.models import Job, JobKind, JobStatus, RouteDay, RouteDayStatus
from identity.models import AuditEvent, Role, RoleCode, User, UserRole
from notifications.models import NotificationRequest, NotificationTemplate
from ordering.models import Channel, Order, OrderEvent, OrderLine, OrderStatus, PaymentStatus
from territory.models import Apartment, Hub

BATCH = 2000
# Order refs and invoice refs start well above anything seed_demo handed out,
# so the two never collide on the unique `ref` column.
REF_START = 5000


class Command(BaseCommand):
    help = "Scale a seeded local database to a year of pilot volume (load test)."

    def add_arguments(self, parser):
        parser.add_argument("--customers", type=int, default=1500)
        parser.add_argument("--orders", type=int, default=36000)
        parser.add_argument("--days", type=int, default=365)
        parser.add_argument("--seed", type=int, default=7)

    def handle(self, *args, **options):
        if settings.SETTINGS_MODULE.endswith(".prod"):
            raise CommandError(
                "seed_load bulk-inserts around the order services; never run it in production."
            )
        random.seed(options["seed"])

        hub = Hub.objects.order_by("created_at").first()
        service = Service.objects.first()
        price_list = PriceList.objects.filter(hub=hub, service=service).first()
        if not (hub and service and price_list):
            raise CommandError(
                "Run `manage.py seed_demo` first: there is no hub, service or price list."
            )
        prices = list(
            PriceLine.objects.filter(price_list=price_list).values_list(
                "garment_type_id", "unit_price_minor"
            )
        )
        apartments = list(Apartment.objects.filter(cluster__hub=hub))
        staff = User.objects.filter(email="founder@ironman.test").first()
        field = User.objects.filter(email="field@ironman.test").first()
        riders = self._riders(hub, field)
        template = NotificationTemplate.objects.first()
        if not (prices and apartments and staff):
            raise CommandError(
                "seed_demo data is missing prices, apartments or the founder account."
            )

        now = timezone.now()
        customers = self._customers(hub, apartments, options["customers"], options["days"], now)
        self.stdout.write(f"customers: {len(customers)}")
        self._orders(
            hub,
            service,
            prices,
            customers,
            apartments,
            staff,
            riders,
            template,
            options["orders"],
            options["days"],
            now,
        )
        self.stdout.write("done")

    @staticmethod
    def _riders(hub, first):
        """The demo rider plus seven more, so a rider's day is a realistic
        20-40 jobs rather than every job in the hub."""
        if first is None:
            return []
        riders = [first]
        field = Role.objects.get(code=RoleCode.FIELD)
        for i in range(1, 8):
            rider, _ = User.objects.get_or_create(
                email=f"rider{i}@ironman.test",
                defaults={
                    "full_name": f"Rider {i}",
                    "is_staff": True,
                    "password": make_password(None),
                },
            )
            UserRole.objects.get_or_create(user=rider, role=field, hub=hub)
            riders.append(rider)
        return riders

    @transaction.atomic
    def _customers(self, hub, apartments, count, days, now):
        made = []
        addresses = []
        # Re-runnable: new customers continue the phone numbering.
        first = Customer.objects.filter(name__startswith="Load Customer").count()
        for i in range(first, first + count):
            joined = now - timedelta(days=random.randint(0, days))
            apartment = random.choice(apartments)
            made.append(
                Customer(
                    hub=hub,
                    phone=f"9{800000000 + i}",
                    name=f"Load Customer {i:05d}",
                    status=Customer.Status.ACTIVE,
                    acquisition_channel=random.choice(["WEB", "WHATSAPP", "WATCHMAN", "WALKIN"]),
                    acquisition_apartment=apartment,
                    created_at=joined,
                )
            )
        Customer.objects.bulk_create(made, batch_size=BATCH)
        for customer in made:
            addresses.append(
                Address(
                    customer=customer,
                    apartment=customer.acquisition_apartment,
                    flat_no=str(random.randint(101, 1204)),
                    block=random.choice(["A", "B", "C"]),
                    is_default=True,
                    created_at=customer.created_at,
                )
            )
        Address.objects.bulk_create(addresses, batch_size=BATCH)
        return made

    def _orders(
        self, hub, service, prices, customers, apartments, staff, riders, template, total, days, now
    ):
        addresses = {a.customer_id: a for a in Address.objects.filter(customer__in=customers)}
        route_days: dict = {}
        counters: dict[str, int] = {}
        # Re-runnable: continue after the highest number already used per month.
        for model, prefix in ((Order, "ORD"), (Invoice, "INV")):
            for ref in model.objects.filter(ref__gte=f"{prefix}-0000").values_list(
                "ref", flat=True
            ):
                key, _, number = ref.rpartition("-")
                if int(number) >= REF_START:
                    counters[key] = max(counters.get(key, REF_START), int(number))

        def next_number(prefix: str, moment) -> str:
            key = f"{prefix}-{moment:%y%m}"
            counters[key] = counters.get(key, REF_START) + 1
            return f"{key}-{counters[key]:04d}"

        # Evenly across the year with a mild weekly rhythm, so a Monday is
        # busier than a Thursday the way a laundry's week actually is.
        weights = [1.4, 1.1, 1.0, 0.9, 1.0, 1.2, 1.5]
        moments = []
        for _ in range(total):
            while True:
                age = (
                    random.random() ** 1.15 * days
                )  # recent days a little heavier: the business grew
                moment = now - timedelta(days=age, minutes=random.randint(0, 600))
                if random.random() < weights[moment.weekday()] / 1.5:
                    moments.append(moment)
                    break
        moments.sort()

        buffers = dict(
            orders=[], lines=[], events=[], invoices=[], payments=[], jobs=[], notes=[], audit=[]
        )
        active = [
            OrderStatus.SCHEDULED,
            OrderStatus.PICKUP_ASSIGNED,
            OrderStatus.AT_HUB,
            OrderStatus.IN_PRODUCTION,
            OrderStatus.READY,
            OrderStatus.OUT_FOR_DELIVERY,
            OrderStatus.DELIVERED,
        ]
        for index, moment in enumerate(moments):
            customer = random.choice(customers)
            address = addresses[customer.id]
            age_days = (now - moment).days
            if age_days > 6:
                status = OrderStatus.CANCELLED if random.random() < 0.03 else OrderStatus.CLOSED
            else:
                status = random.choice(active)
            picked = random.sample(prices, k=random.randint(1, 3))
            lines = [(garment, price, random.randint(1, 6)) for garment, price in picked]
            subtotal = sum(price * qty for _, price, qty in lines)
            delivered = status in (OrderStatus.DELIVERED, OrderStatus.CLOSED)
            paid = status == OrderStatus.CLOSED or (
                status == OrderStatus.DELIVERED and random.random() < 0.5
            )
            order = Order(
                hub=hub,
                ref=next_number("ORD", moment),
                customer=customer,
                address=address,
                apartment=customer.acquisition_apartment,
                service=service,
                channel=random.choice([c.value for c in Channel]),
                status=status,
                payment_status=PaymentStatus.PAID if paid else PaymentStatus.UNPAID,
                pickup_slot_start=moment + timedelta(hours=4),
                pickup_slot_end=moment + timedelta(hours=6),
                picked_up_at=(
                    moment + timedelta(hours=5) if status != OrderStatus.SCHEDULED else None
                ),
                delivered_at=moment + timedelta(days=2) if delivered else None,
                declared_total_qty=sum(q for _, _, q in lines),
                estimate_minor=subtotal,
                subtotal_minor=subtotal,
                total_minor=subtotal,
                created_at=moment,
                cancelled_at=(
                    moment + timedelta(hours=3) if status == OrderStatus.CANCELLED else None
                ),
            )
            buffers["orders"].append(order)
            for garment, price, qty in lines:
                buffers["lines"].append(
                    OrderLine(
                        hub=hub,
                        order=order,
                        garment_type_id=garment,
                        declared_qty=qty,
                        unit_price_minor=price,
                        line_total_minor=price * qty,
                        created_at=moment,
                    )
                )
            for step, event in enumerate(
                ["order.created", "order.pickup_assigned", "order.picked_up"]
            ):
                buffers["events"].append(
                    OrderEvent(
                        order=order,
                        event_type=event,
                        to_status=status if step == 2 else "",
                        actor=staff,
                        created_at=moment + timedelta(hours=step * 2),
                    )
                )
            if template is not None and age_days <= 90:
                buffers["notes"].append(
                    NotificationRequest(
                        hub=hub,
                        recipient_kind="CUSTOMER",
                        recipient_id=customer.id,
                        order=order,
                        template=template,
                        channel=template.channel,
                        dedupe_key=f"load:{order.ref}",
                        status="SENT",
                        created_at=moment,
                    )
                )
            if delivered:
                invoice = Invoice(
                    hub=hub,
                    ref=next_number("INV", moment),
                    order=order,
                    customer=customer,
                    status=InvoiceStatus.PAID if paid else InvoiceStatus.ISSUED,
                    issued_at=moment + timedelta(days=2),
                    subtotal_minor=subtotal,
                    total_minor=subtotal,
                    snapshot=[],
                    created_at=moment + timedelta(days=2),
                )
                buffers["invoices"].append(invoice)
                if paid:
                    buffers["payments"].append(
                        Payment(
                            invoice=invoice,
                            hub=hub,
                            method=random.choice([PaymentMethod.CASH, PaymentMethod.UPI_QR]),
                            amount_minor=subtotal,
                            status=PaymentRowStatus.SUCCEEDED,
                            idempotency_key=f"load:{order.ref}",
                            collected_by=random.choice(riders) if riders else None,
                            at=moment + timedelta(days=2, hours=1),
                        )
                    )
            if age_days <= 30 and riders:
                cluster = order.apartment.cluster
                key = (cluster.id, moment.date())
                if key not in route_days:
                    route_days[key] = RouteDay.objects.get_or_create(
                        hub=hub,
                        cluster=cluster,
                        date=moment.date(),
                        defaults={"status": RouteDayStatus.PLANNED},
                    )[0]
                for kind, offset in ((JobKind.PICKUP, 4), (JobKind.DELIVERY, 52)):
                    buffers["jobs"].append(
                        Job(
                            hub=hub,
                            route_day=route_days[key],
                            order=order,
                            kind=kind,
                            assigned_to=random.choice(riders),
                            status=JobStatus.DONE if delivered else JobStatus.PENDING,
                            slot_start=moment + timedelta(hours=offset),
                            slot_end=moment + timedelta(hours=offset + 2),
                            created_at=moment,
                        )
                    )
            if status in (OrderStatus.CANCELLED, OrderStatus.CLOSED):
                buffers["audit"].append(
                    AuditEvent(
                        actor=staff,
                        action=f"order.{status.lower()}",
                        object_type="Order",
                        object_id=str(order.id),
                        hub=hub,
                        created_at=moment + timedelta(days=2),
                    )
                )
            if (index + 1) % BATCH == 0:
                self._flush(buffers)
                self.stdout.write(f"orders: {index + 1}/{total}")
        self._flush(buffers)

    @transaction.atomic
    def _flush(self, buffers):
        # Parents before children, in dependency order.
        Order.objects.bulk_create(buffers["orders"], batch_size=BATCH)
        OrderLine.objects.bulk_create(buffers["lines"], batch_size=BATCH)
        OrderEvent.objects.bulk_create(buffers["events"], batch_size=BATCH)
        Invoice.objects.bulk_create(buffers["invoices"], batch_size=BATCH)
        Payment.objects.bulk_create(buffers["payments"], batch_size=BATCH)
        Job.objects.bulk_create(buffers["jobs"], batch_size=BATCH)
        NotificationRequest.objects.bulk_create(buffers["notes"], batch_size=BATCH)
        AuditEvent.objects.bulk_create(buffers["audit"], batch_size=BATCH)
        for rows in buffers.values():
            rows.clear()

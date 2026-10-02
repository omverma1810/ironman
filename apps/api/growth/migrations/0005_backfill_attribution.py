from django.db import migrations

# Customer.acquisition_channel used to hold the *order* channel
# (WEB/WHATSAPP/COUNTER/PHONE/APP); it now holds a growth.Channel code.
_GROWTH_CODES = {
    "WATCHMAN",
    "CUSTOMER_REFERRAL",
    "INFLUENCER",
    "FLYER",
    "DIGITAL_AD",
    "WALK_IN",
    "ORGANIC",
    "WHATSAPP",
}
_ORDER_TO_GROWTH = {"WHATSAPP": "WHATSAPP", "COUNTER": "WALK_IN"}


def _growth_code(value: str) -> str:
    if value in _GROWTH_CODES:
        return value
    return _ORDER_TO_GROWTH.get(value, "ORGANIC")


def backfill(apps, schema_editor):
    Customer = apps.get_model("customers", "Customer")
    Order = apps.get_model("ordering", "Order")
    Channel = apps.get_model("growth", "Channel")
    Attribution = apps.get_model("growth", "Attribution")
    ReferralPartner = apps.get_model("growth", "ReferralPartner")

    channels = {c.code: c for c in Channel.objects.all()}

    def channel_for(code):
        # Channel rows come from migration 0003; recreate one if a flush or
        # restore removed it rather than failing the whole migration.
        if code not in channels:
            channels[code], _ = Channel.objects.get_or_create(
                code=code, defaults={"name": code.replace("_", " ").title(), "is_paid": False}
            )
        return channels[code]

    partner_ids = set(ReferralPartner.objects.values_list("id", flat=True))
    legacy_values = {"WEB", "WHATSAPP", "COUNTER", "PHONE", "APP"}

    for customer in Customer.objects.all().iterator():
        first_order = Order.objects.filter(customer_id=customer.id).order_by("created_at").first()
        if first_order is None:
            # Never ordered: drop the old order-channel placeholder so real
            # attribution can fill it in at their first order.
            if customer.acquisition_channel in legacy_values:
                customer.acquisition_channel = ""
                customer.save(update_fields=["acquisition_channel"])
            continue
        if Attribution.objects.filter(customer_id=customer.id, is_first_touch=True).exists():
            continue

        code = _growth_code(customer.acquisition_channel or first_order.channel)
        partner_id = customer.acquisition_partner_id
        Attribution.objects.create(
            hub_id=customer.hub_id,
            customer_id=customer.id,
            order_id=first_order.id,
            channel=channel_for(code),
            apartment_id=customer.acquisition_apartment_id or first_order.apartment_id,
            partner_id=partner_id if partner_id in partner_ids else None,
            is_first_touch=True,
            basis="BACKFILL",
            captured_at=first_order.created_at,
        )
        customer.acquisition_channel = code
        customer.save(update_fields=["acquisition_channel"])


class Migration(migrations.Migration):
    dependencies = [("growth", "0004_attribution")]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]

"""docs/02 §3.10: the eight fixed channel codes. `Channel` is a small,
platform-wide lookup table (see its own docstring) — seeded here via
`RunPython` (same technique `ordering.migrations.0002` uses for its own
backfill) rather than left for an admin to type in by hand before the
console or Django Admin has anything to point `is_paid` at."""

from django.db import migrations

CHANNELS = [
    ("WATCHMAN", "Watchman", True),
    ("CUSTOMER_REFERRAL", "Customer referral", True),
    ("INFLUENCER", "Influencer", True),
    ("FLYER", "Flyer", True),
    ("DIGITAL_AD", "Digital ad", True),
    ("WALK_IN", "Walk-in", False),
    ("ORGANIC", "Organic", False),
    ("WHATSAPP", "WhatsApp", False),
]


def seed_channels(apps, schema_editor):
    Channel = apps.get_model("growth", "Channel")
    for code, name, is_paid in CHANNELS:
        Channel.objects.get_or_create(code=code, defaults={"name": name, "is_paid": is_paid})


def unseed_channels(apps, schema_editor):
    Channel = apps.get_model("growth", "Channel")
    Channel.objects.filter(code__in=[code for code, _, _ in CHANNELS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("growth", "0002_channel_referralpartner_referralcode_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_channels, unseed_channels),
    ]

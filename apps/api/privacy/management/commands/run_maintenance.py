"""Nightly retention and due account deletions (docs/06 §5–6)."""

from django.core.management.base import BaseCommand

from privacy import retention


class Command(BaseCommand):
    help = "Apply the retention policy and complete account deletions whose grace period has ended."

    def handle(self, *args, **options):
        run = retention.run(trigger="command")
        for step, result in run.summary.items():
            self.stdout.write(f"{step}: {result}")
        if run.error:
            self.stderr.write(run.error)
            raise SystemExit(1)

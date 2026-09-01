"""
Base model classes every domain model builds on (docs/02 §2).

- UUIDv7 primary keys: non-guessable, time-ordered for index locality.
- created_at/by, updated_at/by on everything.
- Soft delete: no domain row is ever hard-deleted. `deleted_at` set instead.
- HubScopedModel: every operational row carries a hub (docs/02 §2, R-804) —
  cheap now, a live migration later if it is missing.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone

from common.id import new_uuid7


class SoftDeleteQuerySet(models.QuerySet):
    def alive(self):
        return self.filter(deleted_at__isnull=True)

    def dead(self):
        return self.filter(deleted_at__isnull=False)


class SoftDeleteManager(models.Manager):
    """Default manager excludes soft-deleted rows. Use
    `all_objects` on a model to reach deleted rows (audits, admin)."""

    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db).alive()


class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=new_uuid7, editable=False)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    deleted_at = models.DateTimeField(null=True, blank=True, editable=False)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    objects = SoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True
        ordering = ["-created_at"]

    def soft_delete(self, *, by=None):
        self.deleted_at = timezone.now()
        self.deleted_by = by
        self.save(update_fields=["deleted_at", "deleted_by"])


class TimeStampedUUIDModel(models.Model):
    """A lighter base for rows that exist outside the audited domain model
    lifecycle (OTP challenges, tokens) — UUID pk and a timestamp, nothing
    else."""

    id = models.UUIDField(primary_key=True, default=new_uuid7, editable=False)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        abstract = True
        ordering = ["-created_at"]


class HubScopedModel(BaseModel):
    """Every operational row carries a hub. See ADR-013: this is expansion
    readiness for the client's stated 90-day goal of repeating the model in
    the next cluster — not multi-tenant SaaS."""

    hub = models.ForeignKey("territory.Hub", on_delete=models.PROTECT, related_name="+")

    class Meta(BaseModel.Meta):
        abstract = True


class AppendOnlyManager(models.Manager):
    """Marker manager for append-only tables. `UPDATE`/`DELETE` are also
    revoked from the application DB role in production (docs/02 §5)."""


class AppendOnlyModel(models.Model):
    id = models.UUIDField(primary_key=True, default=new_uuid7, editable=False)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    objects = AppendOnlyManager()

    class Meta:
        abstract = True
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if self.pk and self.__class__.objects.filter(pk=self.pk).exists():
            raise RuntimeError(f"{self.__class__.__name__} is append-only; rows cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError(f"{self.__class__.__name__} is append-only; rows cannot be deleted.")

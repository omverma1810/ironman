"""Growth (docs/02 §3.10, batch 4.6's slice — feedback capture after
delivery). Referral codes, campaigns, commissions and attribution belong
here too eventually; only `Feedback` exists so far."""

from __future__ import annotations

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from common.models import HubScopedModel


class Feedback(HubScopedModel):
    """docs/07 §"Customer Feedback": every ≤2 rating is a retention
    emergency, not a data point — `growth.services.submit_feedback` raises
    an `OrderException` for it, not just a stored row."""

    order = models.OneToOneField(
        "ordering.Order", on_delete=models.CASCADE, related_name="feedback"
    )
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.CASCADE, related_name="feedback"
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    # Staff-moderated: a rating is never shown as a public testimonial
    # until someone reviews it — `responded_by`/`responded_at` record that
    # moderation, not a reply sent back to the customer.
    is_public = models.BooleanField(default=False)
    responded_by = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "growth_feedback"

    def __str__(self) -> str:
        return f"{self.order.ref}: {self.rating}/5"

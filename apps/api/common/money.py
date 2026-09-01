"""
Money as integer minor units (paise), never float (docs/02 §2, ADR-004).

`Money` is a small immutable value object used inside services for
arithmetic; on models, use `MoneyField` (a plain BigIntegerField by
convention, named `..._minor`) plus a currency, and construct `Money` at
the service boundary rather than doing arithmetic on raw ints scattered
through views.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from django.db import models


@dataclass(frozen=True, slots=True)
class Money:
    minor: int  # paise
    currency: str = "INR"

    def __post_init__(self):
        if not isinstance(self.minor, int):
            raise TypeError("Money.minor must be an int (minor units) — never a float")

    @classmethod
    def zero(cls, currency: str = "INR") -> "Money":
        return cls(0, currency)

    @classmethod
    def from_rupees(cls, rupees: str | Decimal, currency: str = "INR") -> "Money":
        d = Decimal(rupees).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return cls(int(d * 100), currency)

    def _check_currency(self, other: "Money"):
        if self.currency != other.currency:
            raise ValueError(f"currency mismatch: {self.currency} vs {other.currency}")

    def __add__(self, other: "Money") -> "Money":
        self._check_currency(other)
        return Money(self.minor + other.minor, self.currency)

    def __sub__(self, other: "Money") -> "Money":
        self._check_currency(other)
        return Money(self.minor - other.minor, self.currency)

    def __mul__(self, factor: int) -> "Money":
        return Money(self.minor * factor, self.currency)

    def percent(self, pct: Decimal) -> "Money":
        """pct as e.g. Decimal('15') for 15%. Half-up rounding to the
        rupee's minor unit — the rule that keeps a ₹3-on-₹15 commission
        exact across tens of thousands of orders (ADR-004)."""
        value = (Decimal(self.minor) * pct / Decimal(100)).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
        return Money(int(value), self.currency)

    def is_negative(self) -> bool:
        return self.minor < 0

    def as_rupees(self) -> Decimal:
        return (Decimal(self.minor) / Decimal(100)).quantize(Decimal("0.01"))

    def to_dict(self) -> dict:
        return {"amount_minor": self.minor, "currency": self.currency}

    def __str__(self) -> str:
        return f"₹{self.as_rupees()}"


class MoneyField(models.BigIntegerField):
    """A BigIntegerField that documents intent: this column stores minor
    units. Purely a naming/typing convention — Postgres sees BIGINT."""

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("default", 0)
        super().__init__(*args, **kwargs)

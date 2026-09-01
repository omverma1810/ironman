"""DRF's built-in SimpleRateThrottle only parses `count/unit` where unit is
a single word (second/minute/hour/day) — it cannot express "3 requests per
10 minutes" (docs/06 §2.1/§4). This subclass adds a numeric window prefix:
`"3/10min"`, `"120/min"`, `"5/hour"` all parse correctly."""

from __future__ import annotations

import re

from rest_framework.throttling import ScopedRateThrottle as _ScopedRateThrottle

_RATE_RE = re.compile(
    r"^(?P<num>\d+)/(?P<mult>\d*)(?P<unit>s|sec|second|m|min|minute|h|hour|d|day)s?$"
)
_UNIT_SECONDS = {
    "s": 1,
    "sec": 1,
    "second": 1,
    "m": 60,
    "min": 60,
    "minute": 60,
    "h": 3600,
    "hour": 3600,
    "d": 86400,
    "day": 86400,
}


class ScopedRateThrottle(_ScopedRateThrottle):
    def parse_rate(self, rate):
        if rate is None:
            return (None, None)
        match = _RATE_RE.match(rate.strip())
        if not match:
            return super().parse_rate(rate)
        num = int(match.group("num"))
        mult = int(match.group("mult")) if match.group("mult") else 1
        duration = _UNIT_SECONDS[match.group("unit")] * mult
        return (num, duration)

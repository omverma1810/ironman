"""Settings for the load test (docs/08 batch 7.6): the test settings (so the
OTP debug endpoint exists and rate limits are relaxed) with the dashboard cache
switched on, as it is in production."""

from .test import *  # noqa: F401,F403

IRONMAN = {**IRONMAN, "ANALYTICS_PAST_WEEK_CACHE_SECONDS": 300}  # noqa: F405

"""Minimal OTP delivery for Phase 1. The real channel router (WhatsApp →
SMS fallback, templated, deduped) is docs/03 §3.3 / Phase 4 — this
interface is the seam it plugs into later without touching call sites."""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger("ironman.otp")


class OtpSender:
    def send(self, *, phone: str, code: str, purpose: str) -> None:
        raise NotImplementedError


class LogOtpSender(OtpSender):
    """Dev/test default: logs the code instead of sending an SMS/WhatsApp
    message. Production wires a real sender via settings."""

    def send(self, *, phone: str, code: str, purpose: str) -> None:
        logger.info("OTP for %s (%s): %s", phone, purpose, code)
        # `OtpChallenge.code_hash` is hashed at rest, so this is the only
        # place the plaintext code ever exists — cached here only when
        # `identity.views.OtpDebugView`'s route is actually registered
        # (config.settings.test), never in an environment that sends a
        # real message.
        if settings.IRONMAN.get("EXPOSE_OTP_DEBUG_ENDPOINT"):
            cache.set(f"otp-debug:{phone}", code, timeout=300)


def get_otp_sender() -> OtpSender:
    return LogOtpSender()

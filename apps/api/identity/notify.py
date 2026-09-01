"""Minimal OTP delivery for Phase 1. The real channel router (WhatsApp →
SMS fallback, templated, deduped) is docs/03 §3.3 / Phase 4 — this
interface is the seam it plugs into later without touching call sites."""

from __future__ import annotations

import logging

logger = logging.getLogger("ironman.otp")


class OtpSender:
    def send(self, *, phone: str, code: str, purpose: str) -> None:
        raise NotImplementedError


class LogOtpSender(OtpSender):
    """Dev/test default: logs the code instead of sending an SMS/WhatsApp
    message. Production wires a real sender via settings."""

    def send(self, *, phone: str, code: str, purpose: str) -> None:
        logger.info("OTP for %s (%s): %s", phone, purpose, code)


def get_otp_sender() -> OtpSender:
    return LogOtpSender()

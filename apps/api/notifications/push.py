"""Push messages to the customer app (docs/08 batch 8.4), through Expo's push
service (https://docs.expo.dev/push-notifications/sending-notifications/):
one HTTPS call carries messages for up to 100 devices, and the reply says,
per device, whether it was accepted and, if not, why.

`PUSH_PROVIDER=expo` turns real sending on. Everywhere else the default is to
log, like the SMS and WhatsApp senders, so development and tests never
message a real phone. Real delivery to a phone also needs the app's push
credentials uploaded to Expo (an Apple key and a Firebase key): an owner
step, not a code one (docs/14).
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass

from django.conf import settings

logger = logging.getLogger("ironman.notifications")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
BATCH = 100


@dataclass(frozen=True)
class PushResult:
    token: str
    ok: bool
    ticket_id: str = ""
    error: str = ""
    # The device is gone for good (app uninstalled, token revoked): stop sending to it.
    unregistered: bool = False


class PushSender:
    def send(self, tokens: list[str], *, title: str, body: str, data: dict) -> list[PushResult]:
        raise NotImplementedError


class LogPushSender(PushSender):
    def send(self, tokens, *, title, body, data):
        for token in tokens:
            logger.info("[push] to %s: %s — %s %s", token, title, body, data)
        return [PushResult(token=t, ok=True) for t in tokens]


class ExpoPushSender(PushSender):
    def __init__(self, access_token: str = "", timeout: float = 10.0):
        self.access_token = access_token
        self.timeout = timeout

    def _post(self, messages: list[dict]) -> list[dict]:
        request = urllib.request.Request(
            EXPO_PUSH_URL,
            data=json.dumps(messages).encode(),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                **({"Authorization": f"Bearer {self.access_token}"} if self.access_token else {}),
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310
            return json.loads(response.read())["data"]

    def send(self, tokens, *, title, body, data):
        results: list[PushResult] = []
        for start in range(0, len(tokens), BATCH):
            chunk = tokens[start : start + BATCH]
            messages = [
                {"to": token, "title": title, "body": body, "data": data, "sound": "default"}
                for token in chunk
            ]
            try:
                tickets = self._post(messages)
            except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as exc:
                # The whole batch failed to leave: report each as failed, not gone.
                results.extend(PushResult(token=t, ok=False, error=str(exc)) for t in chunk)
                continue
            for token, ticket in zip(chunk, tickets, strict=False):
                if ticket.get("status") == "ok":
                    results.append(PushResult(token=token, ok=True, ticket_id=ticket.get("id", "")))
                else:
                    error = (ticket.get("details") or {}).get("error") or ticket.get("message", "")
                    results.append(
                        PushResult(
                            token=token,
                            ok=False,
                            error=str(error),
                            unregistered=error == "DeviceNotRegistered",
                        )
                    )
        return results


def get_push_sender() -> PushSender:
    cfg = settings.IRONMAN
    if cfg.get("PUSH_PROVIDER") == "expo":
        return ExpoPushSender(access_token=cfg.get("EXPO_ACCESS_TOKEN", ""))
    return LogPushSender()

"""The demo seed must never put the public default password on a reachable
system: this repository is public."""

import pytest
from django.core.management.base import CommandError

from common.management.commands.seed_demo import demo_password


def test_local_and_ci_fall_back_to_the_documented_password(monkeypatch, settings):
    monkeypatch.delenv("DEMO_PASSWORD", raising=False)
    settings.SETTINGS_MODULE = "config.settings.test"
    assert demo_password() == "IronMan@2026"


def test_production_refuses_without_a_private_password(monkeypatch, settings):
    monkeypatch.delenv("DEMO_PASSWORD", raising=False)
    settings.SETTINGS_MODULE = "config.settings.prod"
    with pytest.raises(CommandError):
        demo_password()


def test_a_private_password_is_used_when_given(monkeypatch, settings):
    monkeypatch.setenv("DEMO_PASSWORD", "a-private-one")
    settings.SETTINGS_MODULE = "config.settings.prod"
    assert demo_password() == "a-private-one"

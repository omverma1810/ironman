"""docs/08 batch 5.1: partner onboarding and referral-code issuance/
validation. Separate module from `test_feedback.py` (batch 4.6's own
scope) rather than growing that file across two unrelated batches."""

from __future__ import annotations

import pytest

from common.errors import ApiError
from growth import services
from growth.models import PartnerKind, PartnerStatus

pytestmark = pytest.mark.django_db


def test_onboard_partner_creates_active_partner(hub, admin_user):
    partner = services.onboard_partner(
        hub=hub,
        kind=PartnerKind.WATCHMAN,
        name="  Ramesh  ",
        phone=" 9876543210 ",
        actor=admin_user,
    )
    assert partner.name == "Ramesh"
    assert partner.phone == "9876543210"
    assert partner.status == PartnerStatus.ACTIVE
    assert partner.onboarded_by_id == admin_user.id


def test_onboard_partner_requires_name_and_phone(hub):
    with pytest.raises(ApiError):
        services.onboard_partner(hub=hub, kind=PartnerKind.WATCHMAN, name="", phone="123")
    with pytest.raises(ApiError):
        services.onboard_partner(hub=hub, kind=PartnerKind.WATCHMAN, name="Ramesh", phone="  ")


def test_set_partner_status_rejects_unknown_status(hub):
    partner = services.onboard_partner(
        hub=hub, kind=PartnerKind.INFLUENCER, name="Priya", phone="9876543211"
    )
    with pytest.raises(ApiError):
        services.set_partner_status(partner, status="RETIRED")

    updated = services.set_partner_status(partner, status=PartnerStatus.INACTIVE)
    assert updated.status == PartnerStatus.INACTIVE


def test_create_referral_code_requires_exactly_one_owner(hub, customer):
    partner = services.onboard_partner(
        hub=hub, kind=PartnerKind.WATCHMAN, name="Ramesh", phone="9876543210"
    )
    with pytest.raises(ApiError):
        services.create_referral_code(hub=hub)
    with pytest.raises(ApiError):
        services.create_referral_code(hub=hub, owner_partner=partner, owner_customer=customer)


def test_create_referral_code_generates_human_sayable_code(hub):
    partner = services.onboard_partner(
        hub=hub, kind=PartnerKind.WATCHMAN, name="Ramesh Kumar", phone="9876543210"
    )
    code = services.create_referral_code(hub=hub, owner_partner=partner)
    assert code.code.startswith("RAMESHKU")
    assert code.uses_count == 0
    assert code.is_active is True


def test_create_referral_code_rejects_duplicate_explicit_code(hub, customer):
    services.create_referral_code(hub=hub, owner_customer=customer, code="WELCOME10")
    with pytest.raises(ApiError):
        services.create_referral_code(hub=hub, owner_customer=customer, code="welcome10")


def test_validate_referral_code_does_not_increment_uses(hub, customer):
    code = services.create_referral_code(hub=hub, owner_customer=customer, code="FRIEND5")
    found = services.validate_referral_code("friend5")
    assert found.id == code.id
    found.refresh_from_db()
    assert found.uses_count == 0


def test_validate_referral_code_rejects_inactive(hub, customer):
    code = services.create_referral_code(hub=hub, owner_customer=customer, code="OLDCODE")
    services.set_referral_code_active(code, is_active=False)
    with pytest.raises(ApiError):
        services.validate_referral_code("OLDCODE")


def test_validate_referral_code_rejects_unknown_code():
    with pytest.raises(ApiError):
        services.validate_referral_code("NOSUCHCODE")


def test_get_partner_not_found():
    with pytest.raises(ApiError):
        services.get_partner("00000000-0000-0000-0000-000000000000")

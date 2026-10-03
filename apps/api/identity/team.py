"""Staff management (docs/06 §2.2, §3.1 "Manage users & roles").

Who may manage whom:
- The founder manages every staff account except their own.
- An admin manages field staff, operators and viewers in their own hubs. They
  can't create or change another admin or a founder, which keeps admins
  from promoting each other or locking the founder out.

Staff accounts are never deleted (docs/06 §6): they are deactivated, which
signs them out everywhere at once (Django and SimpleJWT both refuse
inactive users), and their history stays attributed to them.
"""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from common import audit
from common.errors import ApiError
from identity.models import STAFF_ROLES, Role, RoleCode, StaffInvite, User, UserRole

ADMIN_GRANTABLE = {RoleCode.FIELD, RoleCode.OPERATOR, RoleCode.VIEWER}
INVITE_DAYS = 7


def _staff_roles(user: User) -> list[UserRole]:
    return [ur for ur in user.user_roles.all() if ur.role.code in STAFF_ROLES]


def _authority(actor: User, role_codes: set[str], hub_ids: set) -> bool:
    if actor.is_superuser or actor.is_unrestricted:
        return True
    if RoleCode.ADMIN not in actor.role_codes:
        return False
    scope = set(actor.hub_scope)
    return role_codes <= ADMIN_GRANTABLE and bool(hub_ids) and hub_ids <= scope


def _require_authority(actor: User, role_codes: set[str], hub_ids: set) -> None:
    if not _authority(actor, role_codes, hub_ids):
        raise ApiError(
            "Only the founder can manage admin and founder accounts, and admins only "
            "manage staff in their own hub.",
            code="forbidden",
            status_code=403,
        )


def members(actor: User):
    """Staff the actor can see: everyone for the founder, the actor's hubs
    for an admin. Inactive accounts are included so they can be reactivated."""
    qs = (
        User.objects.filter(user_roles__role__code__in=STAFF_ROLES)
        .prefetch_related(
            Prefetch("user_roles", queryset=UserRole.objects.select_related("role", "hub"))
        )
        .distinct()
        .order_by("-is_active", "full_name", "email")
    )
    if not (actor.is_superuser or actor.is_unrestricted):
        qs = qs.filter(user_roles__hub_id__in=actor.hub_scope)
    return qs


def pending_invites(actor: User):
    qs = StaffInvite.objects.filter(accepted_at__isnull=True, expires_at__gt=timezone.now())
    qs = qs.select_related("role", "hub", "invited_by").order_by("-created_at")
    if not (actor.is_superuser or actor.is_unrestricted):
        qs = qs.filter(hub_id__in=actor.hub_scope)
    return qs


def _role(code: str) -> Role:
    if code not in STAFF_ROLES:
        raise ApiError("Choose a staff role.", code="validation_error", status_code=400)
    role, _ = Role.objects.get_or_create(code=code, defaults={"name": RoleCode(code).label})
    return role


def _check_hub(role_code: str, hub) -> None:
    if role_code != RoleCode.FOUNDER and hub is None:
        raise ApiError("Choose the hub they work at.", code="validation_error", status_code=400)


@transaction.atomic
def invite(actor: User, *, email: str, role_code: str, hub) -> StaffInvite:
    email = email.strip().lower()
    role = _role(role_code)
    _check_hub(role_code, hub)
    _require_authority(actor, {role_code}, {hub.id} if hub else set())
    if User.objects.filter(email__iexact=email).exists():
        raise ApiError(
            "Someone with that email already has an account. Change their role instead.",
            code="already_exists",
            status_code=409,
        )
    # A fresh invite replaces any still-open one for the same address.
    StaffInvite.objects.filter(email__iexact=email, accepted_at__isnull=True).update(
        expires_at=timezone.now()
    )
    created = StaffInvite.objects.create(
        email=email,
        role=role,
        hub=hub,
        invited_by=actor,
        expires_at=timezone.now() + timedelta(days=INVITE_DAYS),
    )
    audit.record(
        action="staff.invited",
        object_type="StaffInvite",
        object_id=str(created.id),
        hub=hub,
        actor=actor,
        after={"email": email, "role": role_code},
    )
    return created


def revoke_invite(actor: User, invite_obj: StaffInvite) -> None:
    _require_authority(
        actor, {invite_obj.role.code}, {invite_obj.hub_id} if invite_obj.hub_id else set()
    )
    invite_obj.expires_at = timezone.now()
    invite_obj.save(update_fields=["expires_at"])
    audit.record(
        action="staff.invite_revoked",
        object_type="StaffInvite",
        object_id=str(invite_obj.id),
        hub=invite_obj.hub,
        actor=actor,
    )


def _guard_target(actor: User, target: User) -> list[UserRole]:
    if target.pk == actor.pk:
        raise ApiError(
            "You can't change your own account here. Ask the founder.",
            code="forbidden",
            status_code=403,
        )
    current = _staff_roles(target)
    if not current:
        raise ApiError("That isn't a staff account.", code="not_found", status_code=404)
    _require_authority(
        actor,
        {ur.role.code for ur in current},
        {ur.hub_id for ur in current if ur.hub_id},
    )
    return current


@transaction.atomic
def change_role(actor: User, target: User, *, role_code: str, hub) -> User:
    current = _guard_target(actor, target)
    role = _role(role_code)
    _check_hub(role_code, hub)
    _require_authority(actor, {role_code}, {hub.id} if hub else set())
    before = [{"role": ur.role.code, "hub": str(ur.hub_id or "")} for ur in current]
    UserRole.objects.filter(pk__in=[ur.pk for ur in current]).delete()
    UserRole.objects.create(user=target, role=role, hub=hub)
    audit.record(
        action="staff.role_changed",
        object_type="User",
        object_id=str(target.id),
        hub=hub,
        actor=actor,
        before={"roles": before},
        after={"roles": [{"role": role_code, "hub": str(hub.id) if hub else ""}]},
    )
    return target


@transaction.atomic
def set_active(actor: User, target: User, *, active: bool, reason: str = "") -> User:
    current = _guard_target(actor, target)
    if target.is_active == active:
        return target
    target.is_active = active
    target.save(update_fields=["is_active"])
    if not active:
        for token in OutstandingToken.objects.filter(user=target):
            BlacklistedToken.objects.get_or_create(token=token)
    hub_ids = [ur.hub_id for ur in current if ur.hub_id]
    audit.record(
        action="staff.reactivated" if active else "staff.deactivated",
        object_type="User",
        object_id=str(target.id),
        hub=current[0].hub if hub_ids else None,
        actor=actor,
        after={"reason": reason.strip()[:255]} if reason.strip() else {},
    )
    return target


def find_member(actor: User, user_id) -> User:
    target = members(actor).filter(pk=user_id).first()
    if target is None:
        raise ApiError("Staff member not found.", code="not_found", status_code=404)
    return target


def find_invite(actor: User, invite_id) -> StaffInvite:
    found = pending_invites(actor).filter(pk=invite_id).first()
    if found is None:
        raise ApiError("Invite not found.", code="not_found", status_code=404)
    return found

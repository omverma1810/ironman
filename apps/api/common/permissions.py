"""
Server-side RBAC (docs/06 §3). The client hides what a user cannot do;
these classes decide what they may do — UI-only permission checks are a
convenience, never a control.
"""

from __future__ import annotations

from rest_framework.permissions import BasePermission


class HasRole(BasePermission):
    """Usage: `permission_classes = [HasRole.any('ADMIN', 'FOUNDER')]`."""

    allowed_roles: frozenset[str] = frozenset()

    @classmethod
    def any(cls, *roles: str):
        return type("HasRoleDynamic", (cls,), {"allowed_roles": frozenset(roles)})

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if not self.allowed_roles:
            return True
        return bool(user.role_codes & self.allowed_roles)


class IsFounder(HasRole):
    allowed_roles = frozenset({"FOUNDER"})


class IsAdminOrFounder(HasRole):
    allowed_roles = frozenset({"ADMIN", "FOUNDER"})


class IsOpsStaff(HasRole):
    """Anyone who runs day-to-day operations: operator, ops/admin, founder."""

    allowed_roles = frozenset({"OPERATOR", "ADMIN", "FOUNDER"})


class IsFieldStaff(HasRole):
    allowed_roles = frozenset({"FIELD"})


class IsStaff(HasRole):
    """Any non-customer role — used to gate the console app broadly, with
    finer scoping applied per-endpoint on top."""

    allowed_roles = frozenset({"FIELD", "OPERATOR", "ADMIN", "FOUNDER", "VIEWER"})


class ScopedQuerysetMixin:
    """docs/06 §3.2 object scoping, applied uniformly rather than
    per-viewset. A viewset sets `hub_field` (default "hub") to the
    queryset's path to its Hub FK; founders and superusers see everything,
    everyone else is filtered to their `user.hub_scope`.

    A viewset that additionally needs "own records only" (customer, field
    staff) should override `get_queryset()` and call
    `self.scope_to_hub(qs)` before applying the narrower own-record filter,
    so both scopes always apply together.
    """

    hub_field: str = "hub"

    def scope_to_hub(self, queryset):
        user = self.request.user
        if not user.is_authenticated:
            return queryset.none()
        if user.is_superuser or user.is_unrestricted:
            return queryset
        hub_ids = user.hub_scope
        if not hub_ids:
            return queryset.none()
        return queryset.filter(**{f"{self.hub_field}__in": hub_ids})

    def get_queryset(self):
        return self.scope_to_hub(super().get_queryset())

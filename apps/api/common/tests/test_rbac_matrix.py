"""docs/06 §3.1 as a test: "every matrix cell asserted in pytest" (§7).

Each row is a capability from the matrix, the request that exercises it,
and the roles allowed. Every role is tried against every row. A write is
sent with an empty body: permission checks run before validation, so an
allowed role gets a 400 (or 201) and a refused role a 403, without the test
having to build a valid payload for each.

Where the code is deliberately *stricter* than the docs/06 table, the row
says so; none of the deviations grants more access than the table does:

- Price lists and offers are founder-only (docs/04 §3.3), not admin-visible.
- Stage scans are hub work. Riders move bags through their jobs
  (fulfilment), not through the custody scan.
- "Own cash balance" is the rider's cash-in-hand ledger. Admin and Founder
  see everyone's cash through reconciliation instead.

Per-object scoping (◐, "own / assigned only") is covered by the IDOR
probes in `test_idor.py`; this file is about who may reach a capability
at all.
"""

from __future__ import annotations

import pytest

from identity.models import Role, RoleCode, User, UserRole

pytestmark = pytest.mark.django_db

C, F, OP, A, X = "customer", "field", "operator", "admin", "founder"
ROLES = (C, F, OP, A, X)

# (capability as worded in docs/06 §3.1, method, path, roles allowed)
MATRIX = [
    # Orders
    ("Create counter order", "post", "orders/counter", {OP, A, X}),
    ("Scan stage transitions", "post", "custody/scan", {OP, A, X}),  # stricter: no F
    # Prices, offers — the bold rows: the operator must not see what we charge
    ("View price lists", "get", "catalog/price-lists/", {X}),  # stricter: no A
    ("Edit price lists", "post", "catalog/price-lists/", {X}),
    ("Create / edit offers", "post", "catalog/offers/", {X}),  # stricter: no A
    # Money
    ("Cash reconciliation (all staff)", "get", "billing/cash/reconciliation", {A, X}),
    ("Own cash balance", "get", "billing/cash/mine", {F}),  # A, X use reconciliation
    ("Export invoices", "get", "billing/invoices/export/", {A, X}),
    # Commission — bold rows
    ("View commission rules", "get", "growth/commission-rules/", {A, X}),
    ("Edit commission rules", "post", "growth/commission-rules/", {X}),
    ("View settlements", "get", "growth/settlements/", {A, X}),
    ("Run settlement", "post", "growth/settlements/", {X}),
    ("Manage referral partners", "post", "growth/partners/", {A, X}),
    # Marketing — founder only
    ("Enter marketing spend", "post", "growth/spend/", {X}),
    ("Acquisition cost", "get", "growth/acquisition-cost", {X}),
    ("Lapsed customers", "get", "growth/lapsed-customers", {A, X}),
    # Supplies
    ("Supplies: receive", "post", "supplies/receipts", {OP, A, X}),
    ("Supplies: stock levels", "get", "supplies/levels/", {OP, A, X}),
    # Customers
    ("Customer PII (all customers)", "get", "customers/", {OP, A, X}),
    # Analytics
    ("Unit economics / margin", "get", "analytics/unit-economics", {X}),
    ("Weekly numbers", "get", "analytics/weekly", {A, X}),
    ("Operational analytics", "get", "analytics/operations", {OP, A, X}),
    ("Data-quality checks", "get", "analytics/data-quality", {A, X}),
    # People
    ("Manage users & roles (staff list)", "get", "identity/staff", {A, X}),
    ("View audit log", "get", "identity/audit", {A, X}),
    # Privacy
    ("Delete own account", "delete", "me", {C}),
    ("Export own data", "get", "me/export", {C}),
]

REFUSED = {401, 403}


def _role(code):
    role, _ = Role.objects.get_or_create(code=code, defaults={"name": code})
    return role


@pytest.fixture
def users(hub, customer_user, field_user, operator_user, admin_user, founder_user):
    return {C: customer_user, F: field_user, OP: operator_user, A: admin_user, X: founder_user}


@pytest.mark.parametrize("capability,method,path,allowed", MATRIX, ids=[row[0] for row in MATRIX])
def test_matrix_row(api_client, users, hub, capability, method, path, allowed):
    url = f"/api/v1/{path}"
    if method == "get" and "?" not in url:
        url += f"?hub={hub.id}"
    results = {}
    for role in ROLES:
        api_client.force_authenticate(user=users[role])
        response = getattr(api_client, method)(url, {}, format="json")
        results[role] = response.status_code
    reached = {role for role, status in results.items() if status not in REFUSED}
    assert reached == allowed, f"{capability}: {results}"
    assert all(status < 500 for status in results.values()), f"{capability}: {results}"


def test_a_viewer_reaches_no_write(api_client, hub):
    """Viewer (docs/06 §3.1, last column) is read-only everywhere."""
    viewer = User.objects.create_user(email="viewer@test.local", password="testpass1234")
    UserRole.objects.create(user=viewer, role=_role(RoleCode.VIEWER), hub=hub)
    api_client.force_authenticate(user=viewer)
    for _cap, method, path, _ in MATRIX:
        if method == "get":
            continue
        status = getattr(api_client, method)(f"/api/v1/{path}", {}, format="json").status_code
        assert status in REFUSED, f"viewer {method.upper()} {path} → {status}"

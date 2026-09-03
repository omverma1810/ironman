/**
 * UI-side mirror of the server RBAC matrix (docs/06 §3.1). This only
 * controls what renders — the server is the actual authority and
 * re-checks everything (docs/06 §3: "the client hides what a user cannot
 * do; the server decides what they may do").
 */
import type { Role } from "./api/types";

const OPS_ROLES: Role[] = ["OPERATOR", "ADMIN", "FOUNDER"];
const MONEY_ROLES: Role[] = ["ADMIN", "FOUNDER"];

export function hasRole(userRoles: Role[] | undefined, ...allowed: Role[]): boolean {
  if (!userRoles) return false;
  return userRoles.some((r) => allowed.includes(r));
}

export function canAccessConsole(roles: Role[] | undefined): boolean {
  return hasRole(roles, "OPERATOR", "ADMIN", "FOUNDER", "VIEWER", "FIELD");
}

export function canManageOrders(roles: Role[] | undefined): boolean {
  return hasRole(roles, ...OPS_ROLES);
}

export function canManageSupplies(roles: Role[] | undefined): boolean {
  return hasRole(roles, ...OPS_ROLES);
}

// docs/04 §3.8 "[A][B]" tag on the movement ledger and consumption-rule
// formulas — Operator handles day-to-day receipts/issues but doesn't see
// the ledger or edit the rules, same narrowing `canPlanRouteDays` documents
// for route-day planning.
export function canSeeStockLedger(roles: Role[] | undefined): boolean {
  return hasRole(roles, "ADMIN", "FOUNDER");
}

export function canSeeMoney(roles: Role[] | undefined): boolean {
  return hasRole(roles, ...MONEY_ROLES);
}

// docs/04 §3.7 "[O][A]" on issuing an invoice — day-to-day order handling,
// same mapping as `canManageOrders`.
export function canIssueInvoices(roles: Role[] | undefined): boolean {
  return hasRole(roles, ...OPS_ROLES);
}

// docs/06 §3.1's "View invoice" matrix row is `✓` for Operator, `◐ (job)`
// for Field — an operator has to know the amount to collect COD, and a
// rider has to know it to collect at the door. Distinct from
// `canSeeMoney` (Admin/Founder-only): that gates the matrix's *bold* rows
// (price lists, commission rules, unit economics/margin) — "the store
// operator must not see what the business charges" is about those, not
// the invoice total a customer has to be told to pay.
export function canViewInvoices(roles: Role[] | undefined): boolean {
  return hasRole(roles, "FIELD", ...OPS_ROLES);
}

// docs/06 §3.1 "Record payment" row: `◐ (COD)` for Field, `✓` for
// Operator/Admin/Founder. Field is further restricted server-side to
// CASH/UPI_QR only (no ADJUSTMENT) — this only controls whether the
// "Record payment" action renders at all.
export function canRecordPayment(roles: Role[] | undefined): boolean {
  return hasRole(roles, "FIELD", ...OPS_ROLES);
}

// ADJUSTMENT is a correction, same admin/founder territory as credit
// notes — not offered to Operator or Field.
export function canRecordAdjustment(roles: Role[] | undefined): boolean {
  return hasRole(roles, ...MONEY_ROLES);
}

export function canEditPricing(roles: Role[] | undefined): boolean {
  return hasRole(roles, "FOUNDER");
}

export function canManageStaff(roles: Role[] | undefined): boolean {
  return hasRole(roles, "ADMIN", "FOUNDER");
}

// docs/06 §3.1 "[A]" tag on route-day planning — Operator is not in this
// row, unlike most ops-console screens (deliberately narrower than
// canManageOrders).
export function canPlanRouteDays(roles: Role[] | undefined): boolean {
  return hasRole(roles, "ADMIN", "FOUNDER");
}

export function isViewer(roles: Role[] | undefined): boolean {
  return hasRole(roles, "VIEWER") && !hasRole(roles, ...OPS_ROLES);
}

export function roleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    CUSTOMER: "Customer",
    FIELD: "Field Staff",
    OPERATOR: "Store Operator",
    ADMIN: "Ops / Admin",
    FOUNDER: "Founder",
    VIEWER: "Viewer",
  };
  return labels[role];
}

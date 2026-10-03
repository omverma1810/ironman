import { formatMoneyMinor, todayIsoIST } from "@/lib/format";
import type { CommissionAppliesTo, CommissionBasis, CommissionRule } from "@/lib/api/types";

export const BASIS_LABEL: Record<CommissionBasis, string> = {
  PER_ORDER: "Fixed amount per order",
  PER_ITEM: "Fixed amount per item",
  PERCENT_OF_ORDER: "Percent of order value",
  FLAT_FIRST_ORDER: "Flat amount, first order only",
};

export const APPLIES_TO_LABEL: Record<CommissionAppliesTo, string> = {
  FIRST_ORDER_ONLY: "Customer's first order only",
  ALL_ORDERS: "Every order",
  FIRST_N_ORDERS: "Customer's first N orders",
};

/** "₹30 per order · first order only · capped at ₹50" */
export function describeRule(
  rule: Pick<CommissionRule, "basis" | "value" | "applies_to" | "first_n" | "cap_minor">
): string {
  const amount =
    rule.basis === "PERCENT_OF_ORDER"
      ? `${(rule.value / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}% of order`
      : rule.basis === "PER_ITEM"
        ? `${formatMoneyMinor(rule.value)} per item`
        : `${formatMoneyMinor(rule.value)} per order`;
  const scope =
    rule.basis === "FLAT_FIRST_ORDER" || rule.applies_to === "FIRST_ORDER_ONLY"
      ? "first order only"
      : rule.applies_to === "FIRST_N_ORDERS"
        ? `first ${rule.first_n} orders`
        : "every order";
  const cap = rule.cap_minor ? ` · capped at ${formatMoneyMinor(rule.cap_minor)}` : "";
  return `${amount} · ${scope}${cap}`;
}

/** Whether a rule is in force on a given ISO date (defaults to today). */
export function isRuleActive(rule: CommissionRule, today = todayIsoIST()) {
  return rule.effective_from <= today && (!rule.effective_to || today <= rule.effective_to);
}

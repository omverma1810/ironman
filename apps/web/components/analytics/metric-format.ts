import { formatMoneyMinor } from "@/lib/format";
import type { MetricKey, MetricTile } from "@/lib/api/types";

const MONEY: MetricKey[] = ["acquisition_cost", "average_order_value", "contribution"];

/** Tiles where a higher number is bad news. */
export const LOWER_IS_BETTER: MetricKey[] = ["acquisition_cost"];

export function formatMetric(key: MetricKey, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (MONEY.includes(key)) return formatMoneyMinor(value);
  if (key === "on_time") return `${value}%`;
  if (key === "feedback") return `${value.toFixed(1)} / 5`;
  if (key === "orders_per_customer") return value.toFixed(2);
  return value.toLocaleString("en-IN");
}

const num = (v: unknown) => (typeof v === "number" ? v : null);
const money = (v: unknown) => (typeof v === "number" ? formatMoneyMinor(v) : "—");

/** The one line of supporting figures under each headline. */
export function detailLine(tile: MetricTile): string {
  const t = tile as Record<string, unknown>;
  switch (tile.key) {
    case "new_customers":
      return "First order delivered this week";
    case "repeat_customers": {
      const rate = num(t.cohort_repeat_rate);
      const cohort = `${t.cohort_repeated}/${t.cohort_size} of this week's new customers reordered`;
      return rate === null
        ? "Customers who came back this week"
        : `${cohort} (${rate}%)${t.cohort_maturing ? " · still maturing" : ""}`;
    }
    case "orders_per_customer":
      return `${t.orders} orders · ${t.active_customers} customers · lifetime ${num(t.lifetime_average) ?? "—"}`;
    case "acquisition_cost":
      return `Paid channels ${money(t.paid_cac_minor)} · ${t.new_customers} new customers`;
    case "referrals":
      return `Watchmen ${t.watchman} · customers ${t.customer_referral} · commission ${money(t.commission_accrued_minor)}`;
    case "apartments":
      return t.top ? `Busiest: ${t.top}` : "No deliveries this week";
    case "average_order_value":
      return `Median ${money(t.median_minor)} · ${t.orders} orders`;
    case "contribution":
      return `${num(t.margin_pct) ?? "—"}% margin on ${money(t.revenue_minor)} · before fixed costs`;
    case "on_time":
      return `${num(t.excluding_customer_caused) ?? "—"}% excluding customer no-shows · ${t.grace_minutes}-min grace`;
    case "feedback":
      return `${t.responses} ratings · ${num(t.response_rate) ?? "—"}% responded · ${t.detractors} unhappy`;
  }
}

/** Column header and cell formatting for drill-down rows. */
const COST_KINDS = ["CONSUMABLE", "COMMISSION", "LABOUR", "DELIVERY", "OTHER"];

export function columnLabel(key: string): string {
  const base = key.replace(/_minor$/, "").replace(/_/g, " ").toLowerCase();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function cellValue(key: string, value: string | number | null): string {
  if (value === null || value === "") return "—";
  if ((key.endsWith("_minor") || COST_KINDS.includes(key)) && typeof value === "number") {
    return formatMoneyMinor(value);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  }
  return String(value);
}

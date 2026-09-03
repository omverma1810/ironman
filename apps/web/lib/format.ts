/**
 * Money is always {amount_minor, currency} over the wire (docs/04 §1) —
 * these are the only place that shape gets turned into text. Never format
 * a bare number as currency elsewhere in the app.
 */
export type Money = { amount_minor: number; currency: string };

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatMoney(money: Money | null | undefined): string {
  if (!money) return "—";
  if (money.currency !== "INR") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: money.currency,
    }).format(money.amount_minor / 100);
  }
  return inrFormatter.format(money.amount_minor / 100);
}

export function formatMoneyMinor(minor: number, currency = "INR"): string {
  return formatMoney({ amount_minor: minor, currency });
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateTimeFormatter.format(new Date(iso));
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return timeFormatter.format(new Date(iso));
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60_000);
  const rtf = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  return rtf.format(diffDay, "day");
}

const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "Today" as the hub's own calendar date (Asia/Kolkata), not the
 * viewer's browser timezone — `new Date().toISOString()` reads as UTC and
 * disagrees with the server for ~5.5 hours a day (IST is UTC+5:30), which
 * silently shows the wrong day's jobs/route-day to anyone not in IST. */
export function todayIsoIST(): string {
  return istDateFormatter.format(new Date());
}

/** Pure date-string arithmetic — deliberately UTC-midnight internally so a
 * day offset is never off-by-one from a viewer's local DST/timezone. */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

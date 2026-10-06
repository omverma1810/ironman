const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatMoneyMinor(minor: number): string {
  return inrFormatter.format(minor / 100);
}

/** The business runs in India Standard Time: a pickup "at 9" is 9 in Hyderabad
 * whichever timezone the phone has been carried into. */
const TIME_ZONE = "Asia/Kolkata";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateFormatter.format(new Date(iso));
}

const dayFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "2026-10-07" → "Wed, 7 Oct". Parsed as a local calendar day, so it can't
 * slip to the neighbouring day in a timezone behind UTC. */
export function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  // Noon UTC is the same calendar day in every timezone, India included.
  return dayFormatter.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "09:00:00" → "9:00 am". */
export function formatClock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatWindow(start: string, end: string): string {
  return `${formatClock(start)} – ${formatClock(end)}`;
}

const clockFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "Wed, 7 Oct · 9:00 am – 11:00 am" from two instants; "To be scheduled" if unset. */
export function formatWindowRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return "To be scheduled";
  const from = new Date(start);
  const day = dayFormatter.format(from);
  const clock = (d: Date) => clockFormatter.format(d).toLowerCase();
  return end ? `${day} · ${clock(from)} – ${clock(new Date(end))}` : `${day} · ${clock(from)}`;
}

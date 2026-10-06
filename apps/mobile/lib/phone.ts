/**
 * Phone numbers are stored in one shape across web and app: "+" and the
 * country code. A customer who books on the website and then signs in to the
 * app must land on the same account, so both normalise identically (the web
 * booking page does the same, defaulting to India).
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return `+${digits}`;
  // A national number may be typed with a leading 0 (09876543210).
  return `+91${digits.replace(/^0+/, "")}`;
}

/** Looks like a complete number: India's are ten digits starting 6-9. */
export function isPlausiblePhone(raw: string): boolean {
  const normalized = normalizePhone(raw);
  if (normalized.startsWith("+91")) return /^\+91[6-9]\d{9}$/.test(normalized);
  return /^\+[1-9]\d{7,14}$/.test(normalized);
}

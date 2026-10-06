const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function formatMoneyMinor(minor: number): string {
  return inr.format(minor / 100);
}

/** "1,250" or "1250.50" → paise; null when it isn't a positive amount. */
export function rupeesToMinor(input: string): number | null {
  const cleaned = input.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const minor = Math.round(Number(cleaned) * 100);
  return minor > 0 ? minor : null;
}

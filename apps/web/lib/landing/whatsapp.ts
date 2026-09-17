/** docs/08 batch 4.8's WhatsApp entry point, reused by the CTA banner:
 * NEXT_PUBLIC_WHATSAPP_NUMBER is unset until the WhatsApp Business number
 * clears Meta's onboarding, so callers must treat `null` as "don't render
 * this CTA" rather than link to a number that doesn't exist. */
export function whatsappBookingHref(message: string): string | null {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

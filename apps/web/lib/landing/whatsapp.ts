import { CONTACT_EMAIL, WHATSAPP_NUMBER } from "./content";

/** A wa.me link that opens a chat with IRON MAN with `message` already typed
 * in. NEXT_PUBLIC_WHATSAPP_NUMBER overrides the number (for a separate
 * WhatsApp Business number later) without a code change. */
export function whatsappHref(message: string): string {
  const number = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || WHATSAPP_NUMBER).replace(/\D/g, "");
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** A mailto: link to the business with the subject and body already filled
 * in. Line breaks are CRLF, as mail apps expect (RFC 6068). */
export function mailtoHref(subject: string, body: string): string {
  const encode = (value: string) => encodeURIComponent(value).replace(/%0A/g, "%0D%0A");
  return `mailto:${CONTACT_EMAIL}?subject=${encode(subject)}&body=${encode(body)}`;
}

import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { Logo } from "./Navbar";
import {
  CONTACT_ADDRESS,
  CONTACT_EMAIL,
  CONTACT_HOURS,
  CONTACT_PHONE,
  CONTACT_PHONE_TEL,
  NAV_LINKS,
  SERVICES,
} from "@/lib/landing/content";

/** lucide-react v1 dropped brand/social glyphs, so these two are small
 * inline substitutes rather than pulling in a whole icon-brand package
 * for two links. */
function InstagramGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.25-1.5 1.55-1.5H16.7V3.7C16.4 3.66 15.4 3.57 14.24 3.57c-2.32 0-3.9 1.42-3.9 4.02V9.9H7.6V13h2.74v8z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="mt-20 rounded-t-landing-blob bg-landing-ink px-6 pt-16 pb-8 text-stone-300 sm:px-12">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 md:grid-cols-4">
        <div className="flex flex-col gap-4">
          <Logo wordmarkClassName="text-white" />
          <p className="max-w-56 text-sm text-stone-400">
            Doorstep laundry and dry cleaning, backed by transparent digital billing.
          </p>
          <div className="flex items-center gap-3">
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noreferrer"
              aria-label="IronMan on Instagram"
              className="flex size-9 items-center justify-center rounded-full border border-white/10 transition-colors hover:border-landing-gold hover:text-landing-gold"
            >
              <InstagramGlyph />
            </a>
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noreferrer"
              aria-label="IronMan on Facebook"
              className="flex size-9 items-center justify-center rounded-full border border-white/10 transition-colors hover:border-landing-gold hover:text-landing-gold"
            >
              <FacebookGlyph />
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Quick Links</h3>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-stone-400 transition-colors hover:text-landing-gold"
            >
              {link.label}
            </a>
          ))}
          {/* Not part of the spec'd primary nav, but a returning customer
              needs some way back to their order history and tracking. */}
          <Link
            href="/account"
            className="text-sm text-stone-400 transition-colors hover:text-landing-gold"
          >
            Track My Order
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Services</h3>
          {SERVICES.map((service) => (
            <span key={service.slug} className="text-sm text-stone-400">
              {service.title}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Reach Out</h3>
          <p className="flex items-start gap-2 text-sm text-stone-400">
            <MapPin className="mt-0.5 size-4 shrink-0 text-landing-gold" aria-hidden="true" />
            {CONTACT_ADDRESS}
          </p>
          <a
            href={`tel:${CONTACT_PHONE_TEL}`}
            className="flex items-center gap-2 text-sm text-stone-400 transition-colors hover:text-landing-gold"
          >
            <Phone className="size-4 shrink-0 text-landing-gold" aria-hidden="true" />
            {CONTACT_PHONE}
          </a>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="flex items-center gap-2 text-sm text-stone-400 transition-colors hover:text-landing-gold"
          >
            <Mail className="size-4 shrink-0 text-landing-gold" aria-hidden="true" />
            {CONTACT_EMAIL}
          </a>
          <p className="flex items-center gap-2 text-sm text-stone-400">
            <Clock className="size-4 shrink-0 text-landing-gold" aria-hidden="true" />
            {CONTACT_HOURS}
          </p>
        </div>
      </div>

      <div className="mx-auto mt-12 flex max-w-7xl flex-col items-center gap-3 border-t border-white/10 pt-6 text-xs text-stone-500 sm:flex-row sm:justify-between">
        <span>&copy; {new Date().getFullYear()} IronMan. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="transition-colors hover:text-landing-gold">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-landing-gold">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { Logo } from "./Navbar";
import {
  CONTACT_ADDRESS,
  CONTACT_EMAIL,
  CONTACT_HOURS,
  CONTACT_INSTAGRAM,
  CONTACT_PHONE,
  CONTACT_PHONE_TEL,
  NAV_LINKS,
  SERVICES,
} from "@/lib/landing/content";

/** lucide-react v1 dropped brand/social glyphs, so this is a small inline
 * substitute rather than pulling in a whole icon-brand package for one
 * link. (Facebook isn't linked here — there's no real IronMan Facebook
 * page to point to, and a generic placeholder link would misrepresent
 * one existing.) */
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

export function Footer() {
  return (
    <footer className="landing-dark bg-landing-paper px-6 pt-20 pb-8 text-landing-muted sm:px-12">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 md:grid-cols-4">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="max-w-56 text-sm text-landing-muted">
            Crisp clothes, ready when you are. Automatic ironing first, picked up and delivered, with laundry and dry cleaning too.
          </p>
          <div className="flex items-center gap-3">
            <a
              href={CONTACT_INSTAGRAM}
              target="_blank"
              rel="noreferrer"
              aria-label="IRON MAN on Instagram"
              className="flex size-9 items-center justify-center rounded-full border border-white/25 text-landing-fg transition-colors hover:border-landing-gold hover:text-landing-gold"
            >
              <InstagramGlyph />
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold tracking-wide text-landing-fg uppercase">Quick Links</h3>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-landing-muted transition-colors hover:text-landing-fg"
            >
              {link.label}
            </a>
          ))}
          {/* Not part of the spec'd primary nav, but a returning customer
              needs some way back to their order history and tracking. */}
          <Link
            href="/account"
            className="text-sm text-landing-muted transition-colors hover:text-landing-fg"
          >
            Track My Order
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold tracking-wide text-landing-fg uppercase">Services</h3>
          {SERVICES.map((service) => (
            <span key={service.slug} className="text-sm text-landing-muted">
              {service.title}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold tracking-wide text-landing-fg uppercase">Reach Out</h3>
          <p className="flex items-start gap-2 text-sm text-landing-muted">
            <MapPin className="mt-0.5 size-4 shrink-0 text-landing-gold" aria-hidden="true" />
            {CONTACT_ADDRESS}
          </p>
          <a
            href={`tel:${CONTACT_PHONE_TEL}`}
            className="flex items-center gap-2 text-sm text-landing-muted transition-colors hover:text-landing-fg"
          >
            <Phone className="size-4 shrink-0 text-landing-gold" aria-hidden="true" />
            {CONTACT_PHONE}
          </a>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="flex items-center gap-2 text-sm text-landing-muted transition-colors hover:text-landing-fg"
          >
            <Mail className="size-4 shrink-0 text-landing-gold" aria-hidden="true" />
            {CONTACT_EMAIL}
          </a>
          <p className="flex items-center gap-2 text-sm text-landing-muted">
            <Clock className="size-4 shrink-0 text-landing-gold" aria-hidden="true" />
            {CONTACT_HOURS}
          </p>
        </div>
      </div>

      <div className="mx-auto mt-12 flex max-w-7xl flex-col items-center gap-3 border-t border-landing-line pt-6 text-xs text-landing-muted sm:flex-row sm:justify-between">
        <span>&copy; {new Date().getFullYear()} IRON MAN. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="transition-colors hover:text-landing-fg">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-landing-fg">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}

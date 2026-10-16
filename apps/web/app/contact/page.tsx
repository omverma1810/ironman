import Link from "next/link";
import type { Metadata } from "next";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Logo } from "@/components/landing/Navbar";
import { Eyebrow, Heading, LandingButton, Section } from "@/components/landing/ui";
import {
  CONTACT_ADDRESS,
  CONTACT_EMAIL,
  CONTACT_HOURS,
  CONTACT_PHONE,
  CONTACT_PHONES,
  CONTACT_PHONE_TEL,
  EMAIL_TEMPLATES,
  GOOGLE_MAPS_EMBED_URL,
  GOOGLE_MAPS_URL,
  GOOGLE_REVIEW_URL,
  WHATSAPP_MESSAGES,
} from "@/lib/landing/content";
import { mailtoHref, whatsappHref } from "@/lib/landing/whatsapp";

export const metadata: Metadata = {
  title: "Contact",
  description: "Call IRON MAN or find us on Google Maps. Pickup and delivery across Hyderabad.",
};

export default function ContactPage() {
  const [, ...otherPhones] = CONTACT_PHONES;
  return (
    <div className="landing-dark flex min-h-dvh flex-col bg-landing-paper text-landing-fg">
      <header className="flex items-center justify-between p-6 sm:px-10">
        <Logo href="/" />
        <Link href="/" className="text-sm font-medium text-landing-muted transition-colors hover:text-landing-fg">
          Back to home
        </Link>
      </header>

      <main className="flex-1">
        <Section ground="dark" className="px-6 pt-10 pb-24 lg:pb-32">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <Eyebrow>Contact us</Eyebrow>
            <Heading as="h1">
              Talk to <span className="hl">IRON MAN.</span>
            </Heading>
            <p className="text-lg text-landing-muted">
              Orders, pickups, questions or a problem with a delivery: start with the number below.
            </p>
          </div>

          <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
            <div className="landing-accent flex flex-col gap-5 rounded-4xl bg-landing-paper p-8 text-landing-fg md:col-span-2">
              <span className="font-landing-label text-xs font-bold tracking-widest uppercase">
                Primary contact for everything
              </span>
              <a
                href={`tel:${CONTACT_PHONE_TEL}`}
                className="font-landing-heading text-4xl font-extrabold tracking-tight sm:text-6xl"
              >
                {CONTACT_PHONE}
              </a>
              <div className="flex flex-wrap gap-3">
                <LandingButton href={`tel:${CONTACT_PHONE_TEL}`} variant="dark">
                  Call now
                </LandingButton>
                <LandingButton
                  href={whatsappHref(WHATSAPP_MESSAGES.question)}
                  variant="outline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="size-4" aria-hidden="true" />
                  Chat on WhatsApp
                </LandingButton>
                <LandingButton href="/book" variant="outline">
                  Book a pickup
                </LandingButton>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-4xl border border-landing-line bg-landing-card p-8">
              <h2 className="font-landing-heading text-xl font-extrabold">Other numbers</h2>
              <ul className="flex flex-col gap-3">
                {otherPhones.map((phone) => (
                  <li key={phone.tel}>
                    <a
                      href={`tel:${phone.tel}`}
                      className="flex items-center gap-3 text-lg font-medium text-landing-fg"
                    >
                      <Phone className="size-5 text-landing-gold" aria-hidden="true" />
                      {phone.display}
                    </a>
                  </li>
                ))}
              </ul>
              <a
                href={mailtoHref(EMAIL_TEMPLATES.book.subject, EMAIL_TEMPLATES.book.body)}
                className="flex items-center gap-3 text-lg font-medium break-all text-landing-fg"
              >
                <Mail className="size-5 shrink-0 text-landing-gold" aria-hidden="true" />
                {CONTACT_EMAIL}
              </a>
            </div>

            <div className="flex flex-col gap-4 rounded-4xl border border-landing-line bg-landing-card p-8">
              <h2 className="font-landing-heading text-xl font-extrabold">Find us</h2>
              <p className="flex items-start gap-3 text-landing-muted">
                <MapPin className="mt-1 size-5 shrink-0 text-landing-gold" aria-hidden="true" />
                {CONTACT_ADDRESS}
              </p>
              <p className="flex items-center gap-3 text-landing-muted">
                <Clock className="size-5 shrink-0 text-landing-gold" aria-hidden="true" />
                {CONTACT_HOURS}
              </p>
              <div className="pt-1">
                <LandingButton href={GOOGLE_MAPS_URL} target="_blank" rel="noopener noreferrer">
                  Open in Google Maps
                </LandingButton>
              </div>
            </div>

            <div className="overflow-hidden rounded-4xl border border-landing-line md:col-span-2">
              <iframe
                title="IRON MAN on Google Maps"
                src={GOOGLE_MAPS_EMBED_URL}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                className="block h-96 w-full border-0"
              />
            </div>

            <p className="text-center text-landing-muted md:col-span-2">
              Happy with your clothes?{" "}
              <a
                href={GOOGLE_REVIEW_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-landing-fg underline underline-offset-4"
              >
                Leave us a Google review
              </a>
              .
            </p>
          </div>
        </Section>
      </main>

      <footer className="flex flex-col items-center gap-3 border-t border-landing-line p-6 text-xs text-landing-muted sm:flex-row sm:justify-between sm:px-10">
        <span>&copy; {new Date().getFullYear()} IRON MAN. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="transition-colors hover:text-landing-fg">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-landing-fg">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}

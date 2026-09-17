import Link from "next/link";
import { Icon } from "@/components/icons/icon";

/**
 * Privacy notice (docs/08 batch 4.7; docs/00 G-13 — the system collects
 * phone numbers, home addresses and doorstep photos, which the India DPDP
 * Act 2023 requires be disclosed). This is the disclosure half of G-13
 * only: consent capture, retention jobs and self-serve account deletion
 * are Phase 7.5's scope, not built yet — this page says so plainly rather
 * than implying a request tool that doesn't exist.
 */

const LAST_UPDATED = "17 September 2026";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunken">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-brand-yellow text-text-on-brand">
            <Icon name="iron" className="size-5" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-text-primary">
            IronMan
          </span>
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-bold text-text-primary">Privacy notice</h1>
          <p className="text-sm text-text-muted">Last updated: {LAST_UPDATED}</p>
          <p className="text-sm text-text-secondary">
            This notice explains what personal data IronMan collects to run its doorstep ironing
            service, why, and how you can reach us about it. It reflects how the service actually
            works today; it is a working draft and has not yet had a formal legal review before
            public launch.
          </p>
        </div>

        <Section title="What we collect">
          <ul className="flex flex-col gap-2">
            <Li>Your name and phone number, used to sign in and to identify your orders.</Li>
            <Li>
              Your pickup and delivery address — either a saved apartment/flat, or the free-text
              address you type in at booking.
            </Li>
            <Li>
              Order details: the service and garments booked, counts declared and verified at
              intake, pickup/delivery time slots, and any notes or exceptions raised about an
              order.
            </Li>
            <Li>
              Billing information: invoice amounts, GST details where applicable, and the payment
              method and amount you pay at the door (cash or UPI today — no card or bank details
              are collected by us).
            </Li>
            <Li>
              Delivery proof, such as a photo at your doorstep or an OTP confirming handover, kept
              against the order it belongs to.
            </Li>
            <Li>
              Messages we send you over WhatsApp or SMS about your order, and whether they were
              delivered.
            </Li>
            <Li>Any rating or feedback you leave about a completed order.</Li>
          </ul>
        </Section>

        <Section title="Why we collect it">
          <p>We use this information to:</p>
          <ul className="flex flex-col gap-2">
            <Li>Take, schedule, and fulfil your booking, and hand it to the right field staff.</Li>
            <Li>Send you the right update on the right channel at each stage of your order.</Li>
            <Li>Issue invoices and keep the financial records the law requires us to keep.</Li>
            <Li>Investigate and resolve a lost, damaged or disputed order.</Li>
            <Li>Improve the service — for example, understanding a low rating quickly enough to fix it.</Li>
          </ul>
        </Section>

        <Section title="Who sees it">
          <p>
            Your name, phone number and address are visible to the field staff assigned to your
            pickup or delivery, and to hub staff handling your order — never to staff outside the
            hub your order belongs to. We do not sell your data, and we do not share it with
            advertisers. We do not currently use a third-party payment gateway, so no payment
            details are shared with one; if that changes, this notice will be updated first.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            Order and invoice records are kept for as long as applicable tax and business-record
            law requires. Delivery-proof photos and messaging logs are kept against the order they
            belong to, for as long as we may reasonably need them to resolve a dispute about that
            order. We are still building the automated retention and deletion jobs that will
            enforce these periods precisely (see the &ldquo;Your rights&rdquo; section below in the
            meantime).
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under the Digital Personal Data Protection Act, 2023, you can ask us what personal
            data we hold about you, ask us to correct it, or ask us to delete it (subject to
            records we are legally required to keep, such as invoices). A self-serve request tool
            is planned but not live yet — until then, reach us using the contact details below and
            we will handle your request by hand.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Access to your data inside IronMan is role-based: only the staff whose job needs it can
            see it, sensitive actions are logged, and every operational record is scoped to the
            hub that serves you.
          </p>
        </Section>

        <Section title="Changes to this notice">
          <p>
            If we change what we collect or why, we will update this page and change the date at
            the top.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            For any question about your data, or to make a request under the section above, email{" "}
            <a
              href="mailto:privacy@ironman.example"
              className="underline underline-offset-2 hover:text-text-primary"
            >
              privacy@ironman.example
            </a>
            .
          </p>
        </Section>
      </main>

      <footer className="flex flex-col items-center gap-3 border-t border-border-default p-6 text-xs text-text-muted sm:flex-row sm:justify-between sm:px-10">
        <span>&copy; {new Date().getFullYear()} IronMan. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link href="/terms" className="underline-offset-2 hover:text-text-secondary hover:underline">
            Terms of service
          </Link>
          <Link href="/" className="underline-offset-2 hover:text-text-secondary hover:underline">
            Home
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold text-text-primary">{title}</h2>
      <div className="flex flex-col gap-2 text-sm text-text-secondary">{children}</div>
    </section>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="ml-4 list-disc">{children}</li>;
}

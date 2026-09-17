import Link from "next/link";
import { Icon } from "@/components/icons/icon";

/** Terms of service (docs/08 batch 4.7). Describes the service as it
 * actually behaves today (re-quote approval, cash/UPI at the door, the
 * exception process) rather than committing to specific liability figures
 * or refund percentages, which are business decisions this page doesn't
 * make unilaterally — flagged as pending legal review, same as /privacy. */

const LAST_UPDATED = "17 September 2026";

export default function TermsPage() {
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
          <h1 className="font-display text-3xl font-bold text-text-primary">Terms of service</h1>
          <p className="text-sm text-text-muted">Last updated: {LAST_UPDATED}</p>
          <p className="text-sm text-text-secondary">
            These terms cover booking and using IronMan&apos;s doorstep ironing service. This is a
            working draft and has not yet had a formal legal review before public launch.
          </p>
        </div>

        <Section title="The service">
          <p>
            IronMan collects garments from your doorstep, presses them at our hub, and delivers
            them back. You can book on the web or through a WhatsApp link; no app install is
            required.
          </p>
        </Section>

        <Section title="Booking and slots">
          <p>
            Pickup and delivery slots are limited by the capacity we have that day. Booking a slot
            reserves it for you, but promised pickup and delivery times are estimates, not
            guarantees — we will tell you as soon as we know if a slot is going to run late.
          </p>
        </Section>

        <Section title="Pricing and payment">
          <p>
            You&apos;re shown a price based on the garment counts you declare at booking. The
            count we actually verify at intake may differ from what you declared; if it does by
            more than a small margin, we&apos;ll pause the order and ask you to approve the
            revised total before we continue — nothing changes without your say-so. Payment is by
            cash or UPI at the time of delivery, unless you&apos;re paying from IronMan store
            credit.
          </p>
        </Section>

        <Section title="Cancellations">
          <p>
            You can cancel an order before it&apos;s picked up. Once your garments have been
            collected, cancellation is handled case by case — contact us and we&apos;ll sort it
            out.
          </p>
        </Section>

        <Section title="If something goes wrong with your garments">
          <p>
            If a garment is lost, damaged, or delivered wrong, tell us and we&apos;ll open an
            exception with a named owner and a resolution timeline. We&apos;ll offer a fair
            resolution — a re-press, a repair, a credit, or a refund — appropriate to what
            happened. Specific compensation limits are still being finalised and will be
            published here once they are.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            We sign you in with a one-time code sent to your phone number rather than a password.
            Keep your phone secure — anyone who can receive that code can access your account.
          </p>
        </Section>

        <Section title="Feedback and store credit">
          <p>
            You can rate a completed order and leave a comment. Where we offer referral or
            goodwill credit, it is tracked in your account balance and can be used against a
            future order; it has no cash value and cannot be withdrawn.
          </p>
        </Section>

        <Section title="Fair use">
          <p>
            We may decline or suspend service for accounts used fraudulently, abusively, or in a
            way that puts our staff or other customers at risk.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            If we change these terms, we will update this page and change the date at the top.
            Continuing to use the service after a change means you accept the updated terms.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            Questions about these terms? Email{" "}
            <a
              href="mailto:support@ironman.example"
              className="underline underline-offset-2 hover:text-text-primary"
            >
              support@ironman.example
            </a>
            .
          </p>
        </Section>
      </main>

      <footer className="flex flex-col items-center gap-3 border-t border-border-default p-6 text-xs text-text-muted sm:flex-row sm:justify-between sm:px-10">
        <span>&copy; {new Date().getFullYear()} IronMan. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="underline-offset-2 hover:text-text-secondary hover:underline">
            Privacy notice
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

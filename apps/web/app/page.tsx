import Link from "next/link";
import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";

/**
 * The public customer-facing booking flow is Phase 4 (docs/08) — a
 * no-install web link shared over WhatsApp (docs/00 §3.2 P-1, ADR-010).
 * This is a placeholder landing until then, not the real booking wizard.
 */
export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunken">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-brand-yellow text-text-on-brand">
            <Icon name="iron" className="size-5" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-text-primary">
            IronMan
          </span>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/console/login">Staff login</Link>
        </Button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <span className="rounded-pill bg-brand-yellow px-3 py-1 text-xs font-semibold text-text-on-brand">
          Look good. Feel good.
        </span>
        <h1 className="max-w-xl font-display text-3xl font-bold text-balance text-text-primary sm:text-4xl">
          Doorstep ironing, picked up, pressed and delivered back.
        </h1>
        <p className="max-w-md text-sm text-text-secondary sm:text-base">
          Book a pickup on WhatsApp, track your order in real time, and get your clothes back
          pressed and ready to wear — no app to install.
        </p>
        <div className="mt-2 flex flex-col gap-1 rounded-lg border border-border-default bg-surface-raised px-6 py-4 text-sm text-text-secondary">
          <p className="font-medium text-text-primary">Customer booking is on its way</p>
          <p>
            The booking and tracking link (R-101/R-102) ships in Phase 4. For now, this build
            covers the ops console — <Link href="/console/login" className="underline underline-offset-2 hover:text-text-primary">staff can log in here</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}

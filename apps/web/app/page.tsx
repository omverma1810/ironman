import Link from "next/link";
import { Icon, type IconName } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The public marketing landing page (docs/08 batch 4.7). Booking (`/book`),
 * tracking (`/track/{token}`) and the customer account area (`/account`)
 * shipped in earlier Phase 4 batches — this page's job is just to get a
 * first-time visitor from a WhatsApp link to one of those, in one glance.
 */

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "chat",
    title: "Book in under a minute",
    body: "No app to install — book on the web or straight from a WhatsApp link, then confirm by a one-time code sent to your phone.",
  },
  {
    icon: "truck",
    title: "We pick up at your door",
    body: "Pick a slot that works for you. Our rider collects your garments and counts them with you before heading to the hub.",
  },
  {
    icon: "iron",
    title: "Pressed at the hub",
    body: "Every garment is tracked from intake through pressing and quality check — you can watch its status change in real time.",
  },
  {
    icon: "package-open",
    title: "Delivered back, ready to wear",
    body: "Pay by cash or UPI at the door. Rate the order afterwards, or reorder the same booking in one tap next time.",
  },
];

const TRUST_POINTS: { icon: IconName; label: string }[] = [
  { icon: "map-pin", label: "Live order tracking, no login needed" },
  { icon: "shield", label: "Verified pickup & delivery, every time" },
  { icon: "wallet", label: "Pay by cash or UPI at your door" },
  { icon: "star", label: "Rated by customers after every delivery" },
];

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
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/account">My orders</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/console/login">Staff login</Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center gap-16 px-6 py-12 sm:px-10 sm:py-16">
        <section className="flex flex-col items-center gap-6 text-center">
          <span className="rounded-pill bg-brand-yellow px-3 py-1 text-xs font-semibold text-text-on-brand">
            Look good. Feel good.
          </span>
          <h1 className="max-w-xl font-display text-3xl font-bold text-balance text-text-primary sm:text-4xl">
            Doorstep ironing, picked up, pressed and delivered back.
          </h1>
          <p className="max-w-md text-sm text-text-secondary sm:text-base">
            Book a pickup on WhatsApp or the web, track your order in real time, and get your
            clothes back pressed and ready to wear — no app to install.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/book">Book a pickup</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/account">Track my orders</Link>
            </Button>
          </div>
        </section>

        <section className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-4">
          {TRUST_POINTS.map((point) => (
            <div
              key={point.label}
              className="flex flex-col items-center gap-2 rounded-lg border border-border-default bg-surface-raised px-4 py-5 text-center"
            >
              <Icon name={point.icon} className="size-5 text-brand-yellow" />
              <p className="text-xs font-medium text-text-secondary">{point.label}</p>
            </div>
          ))}
        </section>

        <section className="flex w-full max-w-4xl flex-col gap-8">
          <h2 className="text-center font-display text-2xl font-semibold text-text-primary">
            How it works
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <Card key={step.title} className="h-full">
                <CardContent className="flex flex-col gap-3 pt-6">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-brand-yellow/15 text-sm font-semibold text-text-primary">
                      {i + 1}
                    </span>
                    <Icon name={step.icon} className="size-5 text-brand-yellow" />
                  </div>
                  <p className="font-display text-sm font-semibold text-text-primary">
                    {step.title}
                  </p>
                  <p className="text-xs text-text-secondary">{step.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-center gap-4 rounded-lg border border-border-default bg-surface-raised p-8 text-center">
          <p className="font-display text-lg font-semibold text-text-primary">
            Ready to skip the ironing pile?
          </p>
          <Button asChild size="lg">
            <Link href="/book">Book your first pickup</Link>
          </Button>
        </section>
      </main>

      <footer className="flex flex-col items-center gap-3 border-t border-border-default p-6 text-xs text-text-muted sm:flex-row sm:justify-between sm:px-10">
        <span>&copy; {new Date().getFullYear()} IronMan. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="underline-offset-2 hover:text-text-secondary hover:underline">
            Privacy notice
          </Link>
          <Link href="/terms" className="underline-offset-2 hover:text-text-secondary hover:underline">
            Terms of service
          </Link>
          <Link href="/field/login" className="underline-offset-2 hover:text-text-secondary hover:underline">
            Field staff login
          </Link>
        </div>
      </footer>
    </div>
  );
}

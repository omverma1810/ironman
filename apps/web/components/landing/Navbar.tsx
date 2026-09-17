"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, Phone, Shirt, X } from "lucide-react";
import { CONTACT_PHONE, CONTACT_PHONE_TEL, NAV_LINKS } from "@/lib/landing/content";

export function Logo({ wordmarkClassName = "text-landing-ink" }: { wordmarkClassName?: string }) {
  return (
    <Link href="#home" className="flex items-center gap-2">
      <span className="flex size-9 items-center justify-center rounded-full bg-landing-gold text-landing-ink">
        <Shirt className="size-5" aria-hidden="true" />
      </span>
      <span
        className={`font-landing-heading text-lg font-extrabold tracking-tight ${wordmarkClassName}`}
      >
        IronMan
      </span>
    </Link>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>(NAV_LINKS[0].href);

  return (
    <header className="sticky top-0 z-50 bg-landing-paper/0 py-4">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between rounded-full border border-landing-ink/5 bg-landing-card/90 px-6 shadow-landing-lift backdrop-blur">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setActive(link.href)}
              className="relative px-4 py-2 text-sm font-medium text-landing-muted transition-colors hover:text-landing-gold"
            >
              {active === link.href && (
                <motion.span
                  layoutId="landing-nav-underline"
                  className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-landing-gold"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          <a
            href={`tel:${CONTACT_PHONE_TEL}`}
            className="flex items-center gap-2 text-sm font-medium text-landing-ink"
          >
            <Phone className="size-4 text-landing-gold" aria-hidden="true" />
            {CONTACT_PHONE}
          </a>
          <Link
            href="/book"
            className="duration-fast rounded-full bg-landing-gold px-6 py-2.5 text-sm font-semibold text-landing-ink transition hover:scale-103 hover:bg-landing-gold-deep"
          >
            Schedule a Pickup
          </Link>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex size-10 items-center justify-center rounded-full text-landing-ink lg:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="mx-auto mt-3 flex max-w-7xl flex-col gap-1 rounded-2xl border border-landing-ink/5 bg-landing-card p-4 shadow-landing-lift lg:hidden"
          >
            {NAV_LINKS.map((link, i) => (
              <motion.a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-landing-ink hover:bg-landing-paper"
              >
                {link.label}
              </motion.a>
            ))}
            <a
              href={`tel:${CONTACT_PHONE_TEL}`}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-landing-ink hover:bg-landing-paper"
            >
              <Phone className="size-4 text-landing-gold" aria-hidden="true" />
              {CONTACT_PHONE}
            </a>
            <Link
              href="/book"
              className="mt-1 rounded-full bg-landing-gold px-6 py-2.5 text-center text-sm font-semibold text-landing-ink"
            >
              Schedule a Pickup
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

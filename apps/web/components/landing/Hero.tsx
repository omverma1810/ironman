"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Star, Truck } from "lucide-react";
import { EASE_BRAND } from "@/lib/landing/animations";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_BRAND } },
};

/** A flat line-art illustration standing in for the specified Unsplash
 * photography — this sandbox's network policy blocks images.unsplash.com,
 * so no hotlinked photo ID here could be verified before shipping (see
 * next.config.ts). Kept intentionally simple: no gradients, no glass, no
 * floating 3D shapes — two flat fills and a stroke. */
function GarmentIllustration() {
  return (
    <svg viewBox="0 0 400 400" className="size-full" role="img" aria-label="A pressed shirt on a hanger">
      <rect width="400" height="400" rx="24" fill="var(--landing-gold)" opacity="0.12" />
      <line x1="200" y1="52" x2="200" y2="76" stroke="var(--landing-ink)" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M200 52 L172 76 L128 96 L104 148 L136 168 L152 148 L152 320 Q152 336 168 336 L232 336 Q248 336 248 320 L248 148 L264 168 L296 148 L272 96 L228 76 Z"
        fill="var(--landing-card)"
        stroke="var(--landing-ink)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M180 96 Q200 116 220 96" fill="none" stroke="var(--landing-gold-deep)" strokeWidth="4" strokeLinecap="round" />
      <line x1="176" y1="176" x2="176" y2="312" stroke="var(--landing-gold)" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <line x1="200" y1="184" x2="200" y2="320" stroke="var(--landing-gold)" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <line x1="224" y1="176" x2="224" y2="312" stroke="var(--landing-gold)" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section id="home" className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 py-20 lg:grid-cols-2 lg:py-28">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="flex flex-col items-start gap-6"
      >
        <motion.span
          variants={item}
          className="text-sm font-semibold tracking-widest text-landing-gold uppercase"
        >
          Premium Laundry &amp; Dry Cleaning
        </motion.span>

        <motion.h1
          variants={item}
          className="font-landing-heading text-4xl font-extrabold tracking-tight text-balance text-landing-ink sm:text-5xl lg:text-6xl"
        >
          Expert Care for{" "}
          {/* The hand-drawn underline assumes a single text line, which
              "Every Garment." can't always guarantee below ~480px — shown
              from sm: up, where the phrase reliably fits on one line; the
              phrase itself is never forced onto one line (no
              whitespace-nowrap) so it can wrap safely at any width. */}
          <span className="relative inline-block">
            Every Garment.
            <svg
              viewBox="0 0 300 20"
              className="absolute -bottom-2 left-0 hidden h-3 w-full text-landing-gold sm:block"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M2 14 Q 75 4 150 12 T 298 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </motion.h1>

        <motion.p variants={item} className="max-w-md text-lg text-landing-muted">
          Doorstep pickup, fabric-first handling, and a transparent digital invoice — book on the
          web or WhatsApp and track every order in real time.
        </motion.p>

        <motion.div variants={item} className="flex flex-wrap items-center gap-3">
          <Link
            href="/book"
            className="duration-fast rounded-full bg-landing-gold px-6 py-3 text-sm font-semibold text-landing-ink transition-transform hover:scale-103 hover:bg-landing-gold-deep"
          >
            Schedule a Pickup
          </Link>
          <a
            href="#pricing"
            className="rounded-full border border-landing-ink/15 px-6 py-3 text-sm font-semibold text-landing-ink transition-colors hover:border-landing-gold hover:text-landing-gold"
          >
            View Pricing
          </a>
        </motion.div>

        <motion.div
          variants={item}
          className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-sm text-landing-muted"
        >
          <span className="flex items-center gap-1.5">
            <Star className="size-4 fill-landing-gold text-landing-gold" aria-hidden="true" />
            4.9 rating
          </span>
          <span>10,000+ garments cared for</span>
          <span>Same-day available</span>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_BRAND, delay: 0.2 }}
        className="relative"
      >
        <div className="aspect-square overflow-hidden rounded-2xl bg-landing-paper">
          <GarmentIllustration />
        </div>
        <motion.div
          animate={reduce ? undefined : { y: [0, -8, 0] }}
          transition={reduce ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-6 -left-6 flex items-center gap-3 rounded-2xl bg-landing-card p-4 shadow-landing-lift"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-landing-gold/15 text-landing-gold">
            <Truck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-landing-ink">Free Pickup &amp; Delivery</p>
            <p className="text-xs text-landing-muted">Every order, every time</p>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

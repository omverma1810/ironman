"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Check, Truck } from "lucide-react";
import { HERO } from "@/lib/landing/content";
import { EASE_BRAND } from "@/lib/landing/animations";
import { useScrollParallax } from "@/lib/landing/parallax";

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
    <svg
      viewBox="0 0 400 400"
      className="size-full"
      role="img"
      aria-label="A pressed shirt on a hanger"
    >
      <rect
        width="400"
        height="400"
        rx="24"
        fill="var(--landing-gold)"
        opacity="0.12"
      />
      <line
        x1="200"
        y1="52"
        x2="200"
        y2="76"
        stroke="var(--landing-gold)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M200 52 L172 76 L128 96 L104 148 L136 168 L152 148 L152 320 Q152 336 168 336 L232 336 Q248 336 248 320 L248 148 L264 168 L296 148 L272 96 L228 76 Z"
        fill="var(--landing-gold)"
        stroke="var(--landing-ink)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M180 96 Q200 116 220 96"
        fill="none"
        stroke="var(--landing-ink)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line
        x1="176"
        y1="176"
        x2="176"
        y2="312"
        stroke="var(--landing-ink)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="200"
        y1="184"
        x2="200"
        y2="320"
        stroke="var(--landing-ink)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="224"
        y1="176"
        x2="224"
        y2="312"
        stroke="var(--landing-ink)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export function Hero() {
  const reduce = useReducedMotion();
  const { ref: parallaxRef, y: parallaxY } =
    useScrollParallax<HTMLDivElement>(16);

  return (
    <section
      id="home"
      className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 py-20 lg:grid-cols-2 lg:py-28"
    >
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
          {HERO.eyebrow}
        </motion.span>

        <motion.h1
          variants={item}
          className="font-landing-heading text-4xl font-extrabold tracking-tight text-balance text-landing-gold sm:text-5xl lg:text-6xl"
        >
          {HERO.title}
          <span className="block">{HERO.titleAccent}</span>
        </motion.h1>

        <motion.div variants={item} className="flex flex-col gap-4">
          <blockquote
            lang="hi-Latn"
            className="border-l-4 border-l-landing-gold pl-4 font-landing-heading text-xl text-landing-gold italic sm:text-2xl"
          >
            &ldquo;{HERO.quote}&rdquo;
          </blockquote>
          <p className="max-w-md text-lg text-landing-muted">{HERO.body}</p>
        </motion.div>

        {/* One reveal for the actions and the promises under them: the
            promises are what a skimming visitor reads, so they mustn't be
            the last thing to fade in. */}
        <motion.div variants={item} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/book"
              className="duration-fast rounded-full bg-landing-gold px-6 py-3 text-sm font-semibold text-landing-ink transition-transform hover:scale-103 hover:bg-landing-gold-deep"
            >
              Book a Pickup
            </Link>
            <a
              href="#ironing"
              className="rounded-full border border-landing-gold/15 px-6 py-3 text-sm font-semibold text-landing-gold transition-colors hover:border-landing-gold hover:text-landing-gold"
            >
              See How We Iron
            </a>
          </div>

          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-sm text-landing-muted">
            {HERO.chips.map((chip) => (
              <li key={chip} className="flex items-center gap-1.5">
                <Check
                  className="size-4 text-landing-gold"
                  aria-hidden="true"
                />
                {chip}
              </li>
            ))}
          </ul>
        </motion.div>
      </motion.div>

      <motion.div
        ref={parallaxRef}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_BRAND, delay: 0.2 }}
        className="relative"
      >
        <motion.div
          style={reduce ? undefined : { y: parallaxY }}
          className="aspect-square overflow-hidden rounded-2xl bg-landing-paper"
        >
          <GarmentIllustration />
        </motion.div>
        <motion.div
          animate={reduce ? undefined : { y: [0, -8, 0] }}
          transition={
            reduce
              ? undefined
              : { duration: 4, repeat: Infinity, ease: "easeInOut" }
          }
          className="absolute -bottom-6 -left-6 flex items-center gap-3 rounded-2xl bg-landing-card p-4 shadow-landing-lift"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-landing-gold/15 text-landing-gold">
            <Truck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-landing-gold">
              Picked up. Pressed. Back.
            </p>
            <p className="text-xs text-landing-muted">
              Free pickup &amp; delivery
            </p>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { IRONING } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";

/** An iron gliding over a pressed shirt, in the same flat gold-and-ink line
 * art as the rest of the page. The steam lines drift unless the viewer has
 * asked for reduced motion. */
function IronArt() {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 400 320" className="size-full" role="img" aria-label="An iron pressing a folded shirt">
      <rect width="400" height="320" rx="24" fill="var(--landing-gold)" opacity="0.1" />
      {/* folded shirt */}
      <rect x="70" y="196" width="260" height="72" rx="12" fill="var(--landing-gold)" stroke="var(--landing-ink)" strokeWidth="4" />
      <path d="M170 196 L200 222 L230 196" fill="none" stroke="var(--landing-ink)" strokeWidth="4" strokeLinejoin="round" />
      <line x1="200" y1="222" x2="200" y2="268" stroke="var(--landing-ink)" strokeWidth="3" opacity="0.5" />
      <circle cx="200" cy="238" r="3.5" fill="var(--landing-ink)" />
      <circle cx="200" cy="254" r="3.5" fill="var(--landing-ink)" />
      {/* iron */}
      <g transform="translate(118 92)">
        <path
          d="M8 92 Q8 40 70 28 L168 28 Q176 28 176 36 L176 92 Z"
          fill="var(--landing-gold)"
          stroke="var(--landing-ink)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <rect x="4" y="88" width="176" height="14" rx="7" fill="var(--landing-ink)" />
        <path d="M78 28 Q78 2 104 2 L150 2 Q166 2 166 18 L166 28" fill="none" stroke="var(--landing-ink)" strokeWidth="6" strokeLinecap="round" />
        <circle cx="120" cy="60" r="10" fill="var(--landing-ink)" opacity="0.7" />
      </g>
      {/* steam */}
      {[0, 1, 2].map((i) => (
        <motion.path
          key={i}
          d={`M${150 + i * 30} 84 q-10 -14 0 -28 q10 -14 0 -28`}
          fill="none"
          stroke="var(--landing-gold)"
          strokeWidth="4"
          strokeLinecap="round"
          initial={{ opacity: 0.25 }}
          animate={reduce ? undefined : { opacity: [0.25, 0.8, 0.25], y: [0, -6, 0] }}
          transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, delay: i * 0.4 }}
        />
      ))}
    </svg>
  );
}

/** The hero service, said plainly right under the hero: IronMan is an ironing
 * brand first. Everything else on the page supports this. */
export function IroningSpotlight() {
  return (
    <section id="ironing" className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <div className="grid grid-cols-1 items-center gap-12 rounded-landing-blob bg-landing-card p-6 shadow-landing-lift sm:p-10 lg:grid-cols-2 lg:gap-16 lg:p-14">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeUp}
          className="flex flex-col gap-6"
        >
          <div className="aspect-5/4 overflow-hidden rounded-2xl">
            <IronArt />
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="What we iron">
            {IRONING.items.map((thing) => (
              <li
                key={thing}
                className="rounded-full border border-landing-gold/25 px-3 py-1.5 text-sm text-landing-gold"
              >
                {thing}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="flex flex-col gap-5"
        >
          <motion.span variants={fadeUp} className="text-sm font-semibold tracking-widest text-landing-gold uppercase">
            {IRONING.eyebrow}
          </motion.span>
          <motion.h2
            variants={fadeUp}
            className="font-landing-heading text-4xl font-bold text-balance text-landing-gold sm:text-5xl"
          >
            {IRONING.title}
          </motion.h2>
          <motion.p variants={fadeUp} className="text-lg text-landing-muted">
            {IRONING.body}
          </motion.p>
          <motion.ul variants={fadeUp} className="flex flex-col gap-3">
            {IRONING.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-landing-muted">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-landing-gold text-landing-ink">
                  <Check className="size-4" aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </motion.ul>
          <motion.div variants={fadeUp} className="pt-2">
            <Link
              href="/book"
              className="duration-fast inline-block rounded-full bg-landing-gold px-6 py-3 text-sm font-semibold text-landing-ink transition-transform hover:scale-103 hover:bg-landing-gold-deep"
            >
              Book an Ironing Pickup
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

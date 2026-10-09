"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Check } from "lucide-react";
import { IRONING } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";
import { ramp } from "@/lib/landing/scroll";
import { Eyebrow, Heading, LandingButton, Section } from "./ui";

/** An iron pressing a folded shirt, in flat brand colours. The steam drifts
 * unless the visitor has asked for reduced motion. */
function IronArt() {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 400 320" className="size-full" role="img" aria-label="An iron pressing a folded shirt">
      <rect x="70" y="196" width="260" height="72" rx="12" fill="var(--landing-gold)" stroke="var(--landing-ink)" strokeWidth="5" />
      <path d="M170 196 L200 222 L230 196" fill="none" stroke="var(--landing-ink)" strokeWidth="5" strokeLinejoin="round" />
      <line x1="200" y1="222" x2="200" y2="268" stroke="var(--landing-ink)" strokeWidth="4" opacity="0.5" />
      <circle cx="200" cy="238" r="4" fill="var(--landing-ink)" />
      <circle cx="200" cy="254" r="4" fill="var(--landing-ink)" />
      <g transform="translate(118 92)">
        <path d="M8 92 Q8 40 70 28 L168 28 Q176 28 176 36 L176 92 Z" fill="#ffffff" stroke="var(--landing-ink)" strokeWidth="5" strokeLinejoin="round" />
        <rect x="4" y="88" width="176" height="14" rx="7" fill="var(--landing-ink)" />
        <path d="M78 28 Q78 2 104 2 L150 2 Q166 2 166 18 L166 28" fill="none" stroke="var(--landing-ink)" strokeWidth="7" strokeLinecap="round" />
        <circle cx="120" cy="60" r="11" fill="var(--landing-gold)" stroke="var(--landing-ink)" strokeWidth="4" />
      </g>
      {[0, 1, 2].map((i) => (
        <motion.path
          key={i}
          d={`M${150 + i * 30} 84 q-10 -14 0 -28 q10 -14 0 -28`}
          fill="none"
          stroke="var(--landing-ink)"
          strokeWidth="5"
          strokeLinecap="round"
          initial={{ opacity: 0.3 }}
          animate={reduce ? undefined : { opacity: [0.3, 0.9, 0.3], y: [0, -6, 0] }}
          transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, delay: i * 0.4 }}
        />
      ))}
    </svg>
  );
}

/** The hero service, on the brand yellow: ironing first, said big. A giant
 * outlined word slides sideways behind it and the iron floats up as you
 * scroll past, at a different speed from the page. */
export function IroningSpotlight() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const wordX = useTransform(scrollYProgress, (p) => `${ramp(p, [0, 1], [8, -38])}%`);
  const ironY = useTransform(scrollYProgress, (p) => ramp(p, [0, 1], [70, -70]));
  const ironRotate = useTransform(scrollYProgress, (p) => ramp(p, [0, 1], [-4, 4]));

  return (
    <Section ground="accent" id="ironing" ref={ref as never} className="overflow-hidden py-24 lg:py-36">
      <motion.div
        aria-hidden="true"
        style={reduce ? { fontSize: "24vw" } : { x: wordX, fontSize: "24vw" }}
        className="pointer-events-none absolute inset-x-0 top-8 font-landing-heading leading-none font-black tracking-tighter whitespace-nowrap text-transparent select-none [-webkit-text-stroke:2px_rgb(10_10_10/0.22)]"
      >
        CRISP. CRISP. CRISP. CRISP.
      </motion.div>

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-6 lg:grid-cols-2 lg:gap-20">
        <motion.div
          style={reduce ? undefined : { y: ironY, rotate: ironRotate }}
          className="flex flex-col gap-6"
        >
          <div className="aspect-5/4 overflow-hidden rounded-3xl bg-landing-card p-6 shadow-landing-lift">
            <IronArt />
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="What we iron">
            {IRONING.items.map((thing) => (
              <li
                key={thing}
                className="rounded-full border-2 border-landing-ink/80 px-3.5 py-1.5 text-sm font-semibold text-landing-ink"
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
          className="flex flex-col gap-6"
        >
          <motion.div variants={fadeUp}>
            <Eyebrow onAccent>{IRONING.eyebrow}</Eyebrow>
          </motion.div>
          <motion.div variants={fadeUp}>
            <Heading>{IRONING.title}</Heading>
          </motion.div>
          <motion.p variants={fadeUp} className="text-lg font-medium text-landing-muted sm:text-xl">
            {IRONING.body}
          </motion.p>
          <motion.ul variants={fadeUp} className="flex flex-col gap-3">
            {IRONING.points.map((point) => (
              <li key={point} className="flex items-start gap-3 font-medium text-landing-fg">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-landing-ink text-landing-gold">
                  <Check className="size-4" aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </motion.ul>
          <motion.div variants={fadeUp} className="pt-2">
            <LandingButton href="/book" variant="dark">
              Book an Ironing Pickup
            </LandingButton>
          </motion.div>
        </motion.div>
      </div>
    </Section>
  );
}

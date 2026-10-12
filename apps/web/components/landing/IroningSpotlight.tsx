"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { Check } from "lucide-react";
import { IRONING, MACHINES } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";
import { ramp } from "@/lib/landing/scroll";
import { Eyebrow, Heading, LandingButton, Section } from "./ui";

/** Stills of the actual machines from the brand film, in full colour: an
 * automatic press on the left, the steam finishing cabinet overlapping it.
 * Deliberately not an iron icon. IRON MAN is an automatic service. */
function MachineShots({ insetY }: { insetY: MotionValue<number> | null }) {
  const [press, robot] = MACHINES;
  return (
    <div className="relative pb-10">
      <div className="relative aspect-video overflow-hidden rounded-3xl bg-landing-ink shadow-landing-lift">
        <Image
          src={press.src}
          alt={press.alt}
          fill
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="object-cover"
        />
        <span className="absolute bottom-4 left-4 rounded-full bg-landing-ink px-3.5 py-1.5 text-xs font-bold tracking-wide text-landing-gold uppercase">
          {press.label}
        </span>
      </div>
      <motion.div
        style={insetY ? { y: insetY } : undefined}
        className="absolute right-3 bottom-0 w-1/2 overflow-hidden rounded-2xl border-4 border-landing-ink bg-landing-ink shadow-landing-lift sm:right-6"
      >
        <div className="relative aspect-video">
          <Image src={robot.src} alt={robot.alt} fill sizes="(min-width: 1024px) 22vw, 50vw" className="object-cover" />
        </div>
        <span className="absolute bottom-2 left-2 rounded-full bg-landing-ink px-2.5 py-1 text-xs font-bold tracking-wide text-landing-gold uppercase">
          {robot.label}
        </span>
      </motion.div>
    </div>
  );
}

/** The hero service, on the brand yellow: ironing first, said big. A giant
 * outlined word slides sideways behind it and the machines float up as you
 * scroll past, at a different speed from the page. */
export function IroningSpotlight() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const wordX = useTransform(scrollYProgress, (p) => `${ramp(p, [0, 1], [8, -38])}%`);
  const ironY = useTransform(scrollYProgress, (p) => ramp(p, [0, 1], [70, -70]));
  const ironRotate = useTransform(scrollYProgress, (p) => ramp(p, [0, 1], [-2, 2]));
  const insetY = useTransform(scrollYProgress, (p) => ramp(p, [0, 1], [-34, 34]));

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
          <MachineShots insetY={reduce ? null : insetY} />
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

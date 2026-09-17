"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  Calendar,
  ClipboardCheck,
  Sparkles,
  Receipt,
  PackageCheck,
  type LucideIcon,
} from "lucide-react";
import { PROCESS_STEPS, type ProcessStep } from "@/lib/landing/content";
import { fadeUp } from "@/lib/landing/animations";
import { useScrollParallax } from "@/lib/landing/parallax";

const ICONS: Record<ProcessStep["icon"], LucideIcon> = {
  calendar: Calendar,
  "clipboard-check": ClipboardCheck,
  sparkles: Sparkles,
  receipt: Receipt,
  "package-check": PackageCheck,
};

function ProcessIllustration({ step, index }: { step: ProcessStep; index: number }) {
  const reduce = useReducedMotion();
  const { ref, y } = useScrollParallax<HTMLDivElement>(24);
  const Icon = ICONS[step.icon];

  return (
    <div ref={ref} className="aspect-4/3 overflow-hidden rounded-2xl bg-landing-gold/10 lg:aspect-square">
      <motion.div
        style={reduce ? undefined : { y }}
        className="flex size-full items-center justify-center"
      >
        <div className="relative flex size-40 items-center justify-center rounded-full bg-landing-card shadow-landing-lift">
          <span
            className="absolute -top-4 -left-4 flex size-10 items-center justify-center rounded-full bg-landing-gold font-landing-heading text-sm font-extrabold text-landing-ink"
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <Icon className="size-16 text-landing-gold" aria-hidden="true" />
        </div>
      </motion.div>
    </div>
  );
}

export function ProcessSection() {
  return (
    <section id="process" className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <span className="text-sm font-semibold tracking-widest text-landing-gold uppercase">
          Our Process
        </span>
        <h2 className="font-landing-heading text-4xl font-bold text-balance text-landing-ink">
          From pickup to your door, tracked at every step.
        </h2>
        <p className="text-landing-muted">
          Nothing here runs on memory or a phone call — every stage below is a real state in our
          in-house tracking system.
        </p>
      </div>

      <div className="mt-16 flex flex-col gap-16 lg:gap-24">
        {PROCESS_STEPS.map((step, i) => (
          <motion.div
            key={step.title}
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.35 }}
            className={`flex flex-col items-center gap-8 lg:gap-16 ${
              i % 2 === 1 ? "lg:flex-row-reverse" : "lg:flex-row"
            }`}
          >
            <div className="w-full lg:w-1/2">
              <ProcessIllustration step={step} index={i} />
            </div>
            <div className="flex w-full flex-col gap-3 lg:w-1/2">
              <span className="text-sm font-semibold tracking-widest text-landing-gold uppercase">
                Step {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="font-landing-heading text-2xl font-bold text-landing-ink sm:text-3xl">
                {step.title}
              </h3>
              <p className="max-w-md text-landing-muted">{step.description}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

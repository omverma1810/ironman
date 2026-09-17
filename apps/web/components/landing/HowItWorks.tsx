"use client";

import { motion } from "motion/react";
import { CalendarCheck, PackageCheck, Sparkles, type LucideIcon } from "lucide-react";
import { HOW_IT_WORKS } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";

const ICONS: LucideIcon[] = [CalendarCheck, PackageCheck, Sparkles];

export function HowItWorks() {
  return (
    <section className="bg-landing-paper py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          <span className="text-sm font-semibold tracking-widest text-landing-gold uppercase">
            How It Works
          </span>
          <h2 className="font-landing-heading text-4xl font-bold text-balance text-landing-ink">
            Three steps to fresh clothes.
          </h2>
        </div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="relative mt-16 grid grid-cols-1 gap-10 lg:grid-cols-3"
        >
          <div
            className="absolute top-8 hidden border-t-2 border-dashed border-landing-gold/40 lg:block"
            style={{ left: "16.5%", right: "16.5%" }}
            aria-hidden="true"
          />
          {HOW_IT_WORKS.map((step, i) => {
            const Icon = ICONS[i];
            return (
              <motion.div key={step.title} variants={fadeUp} className="relative flex flex-col items-center gap-4 text-center">
                <span className="flex size-16 items-center justify-center rounded-full bg-landing-card text-landing-gold shadow-landing-lift">
                  <Icon className="size-7" aria-hidden="true" />
                </span>
                <h3 className="font-landing-heading text-lg font-bold text-landing-ink">
                  {step.title}
                </h3>
                <p className="max-w-56 text-sm text-landing-muted">{step.description}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

"use client";

import { motion } from "motion/react";
import { NUMBERED_FEATURES } from "@/lib/landing/content";
import { fadeUp } from "@/lib/landing/animations";

export function NumberedFeatures() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <span className="text-sm font-semibold tracking-widest text-landing-gold uppercase">
          Why IronMan
        </span>
        <h2 className="font-landing-heading text-4xl font-bold text-balance text-landing-ink">
          Run like a system, not a favour.
        </h2>
      </div>

      <div className="mx-auto mt-12 max-w-4xl">
        {NUMBERED_FEATURES.map((feature, i) => (
          <motion.div
            key={feature.number}
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            className={`flex flex-col items-start gap-4 border-t border-landing-ink/10 py-10 sm:flex-row sm:items-center sm:gap-8 ${
              i === NUMBERED_FEATURES.length - 1 ? "border-b" : ""
            }`}
          >
            <span
              className="font-landing-heading text-7xl font-extrabold text-transparent"
              style={{ WebkitTextStroke: "1.5px var(--landing-gold)" }}
              aria-hidden="true"
            >
              {feature.number}
            </span>
            <div className="flex flex-col gap-2">
              <h3 className="font-landing-heading text-2xl font-bold text-landing-ink">
                {feature.title}
              </h3>
              <p className="max-w-xl text-landing-muted">{feature.description}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

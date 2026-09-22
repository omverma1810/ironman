"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { PRICING_PLANS } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";

export function PricingTeaser() {
  return (
    <section id="pricing" className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <span className="text-sm font-semibold tracking-widest text-landing-gold uppercase">
          Simple Pricing
        </span>
        <h2 className="font-landing-heading text-4xl font-bold text-balance text-landing-gold">
          No hidden charges, ever.
        </h2>
      </div>

      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3"
      >
        {PRICING_PLANS.map((plan) => (
          <motion.div
            key={plan.name}
            variants={fadeUp}
            className={`relative flex flex-col items-center gap-6 rounded-2xl bg-landing-card p-8 text-center shadow-landing-lift ${
              plan.highlighted ? "scale-105 border-2 border-landing-gold" : ""
            }`}
          >
            {plan.highlighted && (
              <span className="absolute -top-3.5 rounded-full bg-landing-gold px-4 py-1 text-xs font-bold tracking-wide text-landing-ink uppercase">
                Most Popular
              </span>
            )}
            <div>
              <h3 className="font-landing-heading text-lg font-bold text-landing-gold">
                {plan.name}
              </h3>
              <p className="mt-2 text-3xl font-extrabold text-landing-gold">
                {plan.startingAt}
                <span className="text-sm font-medium text-landing-muted"> {plan.unit}</span>
              </p>
              <p className="text-xs text-landing-muted">starting at</p>
            </div>
            <ul className="flex flex-col gap-2.5 text-sm text-landing-muted">
              {plan.bullets.map((bullet) => (
                <li key={bullet} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-landing-gold" aria-hidden="true" />
                  {bullet}
                </li>
              ))}
            </ul>
            <Link
              href="/book"
              className="duration-fast w-full rounded-full bg-landing-gold px-6 py-2.5 text-sm font-semibold text-landing-ink transition-transform hover:scale-103 hover:bg-landing-gold-deep"
            >
              Schedule a Pickup
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <p className="mt-8 text-center text-sm text-landing-muted">
        Final quote confirmed at pickup from our live rate card.
      </p>
    </section>
  );
}

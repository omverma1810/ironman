"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";
import { PRICING_PLANS } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";
import { Eyebrow, Heading, LandingButton, Section } from "./ui";

export function PricingTeaser() {
  return (
    <Section ground="light" id="pricing" className="px-6 py-24 lg:py-36">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
        <Eyebrow>Pricing</Eyebrow>
        <Heading>
          Clear prices. <span className="hl">No surprises.</span>
        </Heading>
      </div>

      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mx-auto mt-16 grid max-w-6xl grid-cols-1 items-stretch gap-6 md:grid-cols-3"
      >
        {PRICING_PLANS.map((plan) => (
          <motion.div
            key={plan.name}
            variants={fadeUp}
            className={`relative flex flex-col items-center gap-6 rounded-4xl p-8 text-center ${
              plan.highlighted
                ? "bg-landing-ink text-white shadow-landing-lift md:-my-4 md:py-12"
                : "bg-landing-card"
            }`}
          >
            {plan.highlighted && (
              <span className="absolute -top-3.5 rounded-full bg-landing-gold px-4 py-1 text-xs font-bold tracking-wide text-landing-ink uppercase">
                {plan.badge ?? "Most popular"}
              </span>
            )}
            <div>
              <h3 className={`font-landing-heading text-xl font-extrabold ${plan.highlighted ? "text-white" : "text-landing-fg"}`}>
                {plan.name}
              </h3>
              {plan.startingAt ? (
                <>
                  <p className={`mt-2 text-4xl font-black ${plan.highlighted ? "text-landing-gold" : "text-landing-fg"}`}>
                    {plan.startingAt}
                    <span className={`text-sm font-medium ${plan.highlighted ? "text-white/70" : "text-landing-muted"}`}> {plan.unit}</span>
                  </p>
                  <p className={`text-xs ${plan.highlighted ? "text-white/70" : "text-landing-muted"}`}>starting at</p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-3xl font-black text-landing-gold">Priced {plan.unit}</p>
                  <p className="text-xs text-white/70">see each item&rsquo;s price as you book</p>
                </>
              )}
            </div>
            <ul className={`flex flex-col gap-2.5 text-sm ${plan.highlighted ? "text-white/85" : "text-landing-muted"}`}>
              {plan.bullets.map((bullet) => (
                <li key={bullet} className="flex items-center gap-2">
                  <Check className={`size-4 shrink-0 ${plan.highlighted ? "text-landing-gold" : "text-landing-fg"}`} aria-hidden="true" />
                  {bullet}
                </li>
              ))}
            </ul>
            <LandingButton
              href="/book"
              variant={plan.highlighted ? "primary" : "outline"}
              className="mt-auto w-full"
            >
              Book a Pickup
            </LandingButton>
          </motion.div>
        ))}
      </motion.div>

      <p className="mt-10 text-center text-sm text-landing-muted">
        The price you see when you book is the price you pay.
      </p>
    </Section>
  );
}

"use client";

import { motion } from "motion/react";
import { Star } from "lucide-react";
import { TESTIMONIALS } from "@/lib/landing/content";
import { fadeUp } from "@/lib/landing/animations";
import { Eyebrow, Heading, Section } from "./ui";

export function Testimonials() {
  return (
    <Section ground="dark" className="px-6 py-24 lg:py-36">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        variants={fadeUp}
        className="mx-auto max-w-7xl"
      >
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
          <Eyebrow>The IRON MAN experience</Eyebrow>
          <Heading>
            Don&rsquo;t just <span className="hl">take our word for it.</span>
          </Heading>
        </div>
        {/* Focusable so keyboard users can scroll it with the arrow keys (WCAG 2.1.1). */}
        <div
          className="mt-12 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4"
          tabIndex={0}
          role="region"
          aria-label="Customer testimonials"
        >
          {TESTIMONIALS.map((testimonial) => {
            const initials = testimonial.name
              .split(" ")
              .map((part) => part[0])
              .join("");
            return (
              <div
                key={`${testimonial.name}-${testimonial.locality}`}
                className="flex w-80 shrink-0 snap-start flex-col gap-4 rounded-3xl border border-landing-line bg-landing-card p-7"
              >
                <div className="flex gap-1" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-4 fill-landing-gold text-landing-gold" />
                  ))}
                </div>
                <p className="text-base text-landing-fg/90">&ldquo;{testimonial.quote}&rdquo;</p>
                <div className="mt-auto flex items-center gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-landing-gold font-landing-heading text-xs font-bold text-landing-ink"
                    aria-hidden="true"
                  >
                    {initials}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-landing-fg">{testimonial.name}</p>
                    <p className="text-xs text-landing-muted">{testimonial.locality}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </Section>
  );
}

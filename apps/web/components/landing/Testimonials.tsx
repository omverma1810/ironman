"use client";

import { motion } from "motion/react";
import { Star } from "lucide-react";
import { TESTIMONIALS } from "@/lib/landing/content";
import { fadeUp } from "@/lib/landing/animations";

export function Testimonials() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        variants={fadeUp}
        className="rounded-landing-blob bg-landing-card px-6 py-16 shadow-landing-lift sm:px-12"
      >
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          <span className="text-sm font-semibold tracking-widest text-landing-gold uppercase">
            Customer Love
          </span>
          <h2 className="font-landing-heading text-4xl font-bold text-balance text-landing-gold">
            Trusted with the clothes people actually care about.
          </h2>
        </div>

        <div className="mt-12 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4">
          {TESTIMONIALS.map((testimonial) => {
            const initials = testimonial.name
              .split(" ")
              .map((part) => part[0])
              .join("");
            return (
              <div
                key={testimonial.name}
                className="flex w-80 shrink-0 snap-start flex-col gap-4 rounded-2xl border border-landing-gold/15 p-6"
              >
                <div className="flex gap-1" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-4 fill-landing-gold text-landing-gold" />
                  ))}
                </div>
                <p className="text-sm text-landing-muted">&ldquo;{testimonial.quote}&rdquo;</p>
                <div className="mt-auto flex items-center gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-landing-gold/15 font-landing-heading text-xs font-bold text-landing-gold"
                    aria-hidden="true"
                  >
                    {initials}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-landing-gold">{testimonial.name}</p>
                    <p className="text-xs text-landing-muted">{testimonial.locality}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
}

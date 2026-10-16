"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { Star } from "lucide-react";
import { GOOGLE_REVIEW_URL, REVIEW_POSTER } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";
import { Eyebrow, Heading, LandingButton, Section } from "./ui";

const STEPS = ["Open your camera", "Scan the QR code", "Leave a review"];

/** Asks happy customers for a Google review. The poster is the same one
 * printed for the shop, so the QR code works from a counter or another
 * screen. On a phone a visitor cannot scan their own screen, so the button
 * opens the same page the QR code does. */
export function ReviewCTA() {
  return (
    <Section ground="accent" id="reviews" className="overflow-hidden px-6 py-24 lg:py-32">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="flex flex-col items-start gap-6"
        >
          <motion.div variants={fadeUp}>
            <Eyebrow onAccent>Your feedback helps us grow</Eyebrow>
          </motion.div>
          <motion.div variants={fadeUp}>
            <Heading>Loved our service? Tell the next customer.</Heading>
          </motion.div>
          <motion.div
            variants={fadeUp}
            className="flex gap-1 text-landing-ink"
            role="img"
            aria-label="Five stars"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="size-7 fill-current" aria-hidden="true" />
            ))}
          </motion.div>
          <motion.p variants={fadeUp} className="text-lg font-medium text-landing-muted sm:text-xl">
            A short Google review takes under a minute and helps people nearby find a service they can
            trust.
          </motion.p>
          <motion.ol variants={fadeUp} className="flex flex-col gap-2 font-medium text-landing-fg">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-landing-ink text-sm font-bold text-landing-gold">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </motion.ol>
          <motion.div variants={fadeUp} className="pt-2">
            <LandingButton href={GOOGLE_REVIEW_URL} variant="dark" target="_blank" rel="noopener noreferrer">
              Leave a Google review
            </LandingButton>
          </motion.div>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="mx-auto w-full max-w-sm"
        >
          <Image
            src={REVIEW_POSTER.src}
            alt={REVIEW_POSTER.alt}
            width={REVIEW_POSTER.width}
            height={REVIEW_POSTER.height}
            sizes="(min-width: 1024px) 384px, 90vw"
            className="h-auto w-full rounded-3xl shadow-landing-lift"
          />
        </motion.div>
      </div>
    </Section>
  );
}

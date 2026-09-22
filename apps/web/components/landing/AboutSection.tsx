"use client";

import { motion } from "motion/react";
import { HeartHandshake, Eye, BadgeCheck, type LucideIcon } from "lucide-react";
import { ABOUT_VALUES, type Value } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";

const ICONS: Record<Value["icon"], LucideIcon> = {
  "heart-handshake": HeartHandshake,
  eye: Eye,
  "badge-check": BadgeCheck,
};

export function AboutSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeUp}
          className="flex flex-col gap-5"
        >
          <span className="text-sm font-semibold tracking-widest text-landing-gold uppercase">
            About IronMan
          </span>
          <h2 className="font-landing-heading text-4xl font-bold text-balance text-landing-gold">
            Built because guesswork has no place in laundry.
          </h2>
          <p className="text-landing-muted">
            IronMan started with a simple complaint: nobody could tell you where their clothes
            were, what they&rsquo;d be charged, or when they&rsquo;d actually come back. We built
            our own operating system for the hub floor first — tagging, tracking and billing
            every garment — and put the same system in your hands as a tracking link and an
            itemized invoice.
          </p>
          <p className="text-landing-muted">
            No outsourced processing, no &ldquo;we&rsquo;ll call you&rdquo; — every order runs
            through the same system our own team uses to run the floor.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="flex flex-col gap-6"
        >
          {ABOUT_VALUES.map((value) => {
            const Icon = ICONS[value.icon];
            return (
              <motion.div
                key={value.title}
                variants={fadeUp}
                className="flex items-start gap-4 rounded-2xl bg-landing-card p-6 shadow-landing-lift"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-landing-gold/15 text-landing-gold">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-landing-heading font-bold text-landing-gold">{value.title}</h3>
                  <p className="text-sm text-landing-muted">{value.description}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

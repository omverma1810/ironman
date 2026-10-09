"use client";

import { motion } from "motion/react";
import { MapPin, MessageCircle, Receipt, ShieldCheck, Truck, Zap, type LucideIcon } from "lucide-react";
import { NUMBERED_FEATURES, type NumberedFeature } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";
import { Eyebrow, Heading, Section } from "./ui";

const ICONS: Record<NumberedFeature["icon"], LucideIcon> = {
  truck: Truck,
  shield: ShieldCheck,
  receipt: Receipt,
  zap: Zap,
  "map-pin": MapPin,
  "message-circle": MessageCircle,
};

/** Why IRON MAN: six promises as cards that rise in one after another. */
export function NumberedFeatures() {
  return (
    <Section ground="light" className="px-6 py-24 lg:py-36">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
        <Eyebrow>Why IRON MAN</Eyebrow>
        <Heading>
          Clothing care, <span className="hl">made more reliable.</span>
        </Heading>
      </div>

      <motion.ul
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
        className="mx-auto mt-16 grid max-w-7xl grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
      >
        {NUMBERED_FEATURES.map((feature) => {
          const Icon = ICONS[feature.icon];
          return (
            <motion.li
              key={feature.number}
              variants={fadeUp}
              whileHover={{ y: -8 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="group flex flex-col gap-5 rounded-3xl bg-landing-card p-8 transition-colors hover:bg-landing-gold"
            >
              <div className="flex items-start justify-between">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-landing-ink text-landing-gold">
                  <Icon className="size-7" aria-hidden="true" />
                </span>
                <span
                  className="font-landing-heading text-5xl font-black text-transparent [-webkit-text-stroke:1.5px_rgb(10_10_10/0.35)]"
                  aria-hidden="true"
                >
                  {feature.number}
                </span>
              </div>
              <h3 className="font-landing-heading text-2xl font-extrabold tracking-tight text-landing-fg">
                {feature.title}
              </h3>
              <p className="text-landing-muted group-hover:text-landing-ink">{feature.description}</p>
            </motion.li>
          );
        })}
      </motion.ul>
    </Section>
  );
}

"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Truck,
  ShieldCheck,
  Receipt,
  Zap,
  MapPin,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { NUMBERED_FEATURES, type NumberedFeature } from "@/lib/landing/content";

const ICONS: Record<NumberedFeature["icon"], LucideIcon> = {
  truck: Truck,
  shield: ShieldCheck,
  receipt: Receipt,
  zap: Zap,
  "map-pin": MapPin,
  "message-circle": MessageCircle,
};

/** Apple-style feature list: a sticky illustration panel that swaps as the
 * viewer scrolls past each numbered row. `onViewportEnter` per row (rather
 * than a continuous scroll-linked transform) keeps this simple and robust
 * — no useScroll math, just "this row is now the one centred in view." */
export function NumberedFeatures() {
  const [active, setActive] = useState(0);
  const ActiveIcon = ICONS[NUMBERED_FEATURES[active].icon];

  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <span className="text-sm font-semibold tracking-widest text-landing-gold uppercase">
          Why IronMan
        </span>
        <h2 className="font-landing-heading text-4xl font-bold text-balance text-landing-gold">
          Run like a system, not a favour.
        </h2>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="hidden lg:block">
          <div className="sticky top-32 flex h-105 items-center justify-center rounded-landing-blob bg-landing-card shadow-landing-lift">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center gap-4 text-center"
              >
                <span className="flex size-24 items-center justify-center rounded-full bg-landing-gold/15 text-landing-gold">
                  <ActiveIcon className="size-12" aria-hidden="true" />
                </span>
                <span className="font-landing-heading text-2xl font-bold text-landing-gold">
                  {NUMBERED_FEATURES[active].title}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div>
          {NUMBERED_FEATURES.map((feature, i) => {
            const Icon = ICONS[feature.icon];
            const isActive = active === i;
            return (
              <div key={feature.number} className="relative">
                {/* Scrollspy trigger only — kept separate from the fade-up
                    reveal below because a single element's `viewport` prop
                    configures both whileInView and onViewportEnter, and
                    the two need different margins (a %-shrunk band to
                    detect "centred," vs. a normal one-time reveal). */}
                <motion.div
                  aria-hidden="true"
                  onViewportEnter={() => setActive(i)}
                  viewport={{ margin: "-45% 0px -45% 0px" }}
                  className="pointer-events-none absolute inset-0"
                />
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className={`flex flex-col items-start gap-4 border-t border-landing-gold/10 py-8 transition-opacity sm:flex-row sm:items-center sm:gap-6 ${
                    i === NUMBERED_FEATURES.length - 1 ? "border-b" : ""
                  } ${!isActive ? "lg:opacity-50" : ""}`}
                >
                  <span
                    className="font-landing-heading text-5xl font-extrabold text-transparent sm:text-6xl"
                    style={{ WebkitTextStroke: "1.5px var(--landing-gold)" }}
                    aria-hidden="true"
                  >
                    {feature.number}
                  </span>
                  <div className="flex flex-col gap-2">
                    <h3 className="flex items-center gap-2 font-landing-heading text-xl font-bold text-landing-gold sm:text-2xl">
                      <Icon className="size-5 text-landing-gold lg:hidden" aria-hidden="true" />
                      {feature.title}
                    </h3>
                    <p className="max-w-xl text-landing-muted">{feature.description}</p>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

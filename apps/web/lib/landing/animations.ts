import type { Variants } from "motion/react";

/** Shared Framer Motion variants for the marketing landing page only —
 * every scroll-triggered section uses `initial="hidden" whileInView="show"
 * viewport={{ once: true, amount: 0.2 }}`. */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

export const EASE_BRAND: [number, number, number, number] = [0.22, 1, 0.36, 1];

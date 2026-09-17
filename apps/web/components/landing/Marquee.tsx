"use client";

import { motion, useReducedMotion } from "motion/react";

const MESSAGE =
  "FREE DOORSTEP PICKUP • SAME-DAY EXPRESS • PREMIUM DRY CLEANING • DESIGNER GARMENT CARE • ";

function Track() {
  return (
    <div className="flex shrink-0 items-center">
      {Array.from({ length: 4 }).map((_, i) => (
        <span key={i} className="mx-6 whitespace-nowrap">
          {MESSAGE}
        </span>
      ))}
    </div>
  );
}

export function Marquee() {
  const reduce = useReducedMotion();

  return (
    // Purely decorative, repeated promotional text — hidden from assistive
    // tech rather than announced twice (once per duplicated track).
    <div className="overflow-hidden bg-landing-gold py-3 text-landing-ink" aria-hidden="true">
      <motion.div
        className="flex text-xs font-bold tracking-[0.2em] uppercase"
        animate={reduce ? undefined : { x: ["0%", "-50%"] }}
        transition={reduce ? undefined : { ease: "linear", duration: 22, repeat: Infinity }}
      >
        <Track />
        <Track />
      </motion.div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { IMPACT_STATS, type ImpactStat } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";

function useCountUp(target: number, active: boolean, reduceMotion: boolean, duration = 1.4) {
  const [value, setValue] = useState(reduceMotion ? target : 0);

  useEffect(() => {
    if (!active || reduceMotion) return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration, reduceMotion]);

  return value;
}

function StatCounter({ stat, active }: { stat: ImpactStat; active: boolean }) {
  const reduceMotion = useReducedMotion() ?? false;
  const value = useCountUp(stat.value, active, reduceMotion);

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="font-landing-heading text-5xl font-bold text-landing-ink tabular-nums sm:text-6xl">
        {stat.prefix}
        {value.toFixed(stat.decimals ?? 0)}
        {stat.suffix}
      </p>
      <p className="text-sm text-landing-muted">{stat.label}</p>
    </div>
  );
}

export function ImpactStats() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });

  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <motion.div
        ref={ref}
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        className="grid grid-cols-2 gap-8 rounded-landing-blob bg-landing-card px-6 py-12 shadow-landing-lift sm:px-12 lg:grid-cols-4"
      >
        {IMPACT_STATS.map((stat) => (
          <motion.div key={stat.label} variants={fadeUp}>
            <StatCounter stat={stat} active={inView} />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

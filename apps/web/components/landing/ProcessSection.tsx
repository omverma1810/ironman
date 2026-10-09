"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Calendar, ClipboardCheck, PackageCheck, Receipt, Sparkles, type LucideIcon } from "lucide-react";
import { PROCESS_STEPS, type ProcessStep } from "@/lib/landing/content";
import { ramp } from "@/lib/landing/scroll";
import { Eyebrow, Heading, Section } from "./ui";

const ICONS: Record<ProcessStep["icon"], LucideIcon> = {
  calendar: Calendar,
  "clipboard-check": ClipboardCheck,
  sparkles: Sparkles,
  receipt: Receipt,
  "package-check": PackageCheck,
};

/** How an order goes, told as you scroll: the black card on the left stays
 * put and changes to the step you're reading, while its yellow ring turns
 * with the page. On a phone each step carries its own icon instead. */
export function ProcessSection() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: listRef, offset: ["start center", "end center"] });
  const ringTurn = useTransform(scrollYProgress, (p) => ramp(p, [0, 1], [0, 270]));
  const fill = useTransform(scrollYProgress, (p) => `${ramp(p, [0, 1], [0, 100])}%`);
  const ActiveIcon = ICONS[PROCESS_STEPS[active].icon];

  return (
    <Section ground="light" id="process" className="px-6 py-24 lg:py-36">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
        <Eyebrow>How it works</Eyebrow>
        <Heading>
          Hand it over. <span className="hl">We&rsquo;ll take it from here.</span>
        </Heading>
        <p className="text-lg text-landing-muted">
          Five simple steps, and you can see where your clothes are at every one of them.
        </p>
      </div>

      <div className="mx-auto mt-16 grid max-w-7xl grid-cols-1 gap-10 lg:mt-24 lg:grid-cols-2 lg:gap-20">
        <div className="hidden lg:block">
          <div className="sticky top-28 flex aspect-square max-h-140 items-center justify-center overflow-hidden rounded-landing-blob bg-landing-ink p-10 text-white">
            <motion.svg
              aria-hidden="true"
              viewBox="0 0 200 200"
              style={reduce ? { width: "78%", height: "78%" } : { rotate: ringTurn, width: "78%", height: "78%" }}
              className="absolute"
            >
              <circle cx="100" cy="100" r="94" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="2" />
              <circle cx="100" cy="100" r="94" fill="none" stroke="#ffd60a" strokeWidth="4" strokeLinecap="round" strokeDasharray="120 471" />
            </motion.svg>
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 24, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -24, scale: 0.92 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="relative flex flex-col items-center gap-5 text-center"
              >
                <span className="flex size-28 items-center justify-center rounded-full bg-landing-gold text-landing-ink">
                  <ActiveIcon className="size-14" aria-hidden="true" />
                </span>
                <span className="font-landing-heading text-7xl leading-none font-black text-white tabular-nums">
                  {String(active + 1).padStart(2, "0")}
                </span>
                <span className="font-landing-heading text-2xl font-extrabold text-landing-gold">
                  {PROCESS_STEPS[active].title}
                </span>
              </motion.div>
            </AnimatePresence>
            <div aria-hidden="true" className="absolute inset-x-10 bottom-8 h-1 rounded-full bg-white/15">
              <motion.div style={{ width: fill }} className="h-full rounded-full bg-landing-gold" />
            </div>
          </div>
        </div>

        <div ref={listRef} className="flex flex-col">
          {PROCESS_STEPS.map((step, i) => {
            const Icon = ICONS[step.icon];
            return (
              <motion.div
                key={step.title}
                onViewportEnter={() => setActive(i)}
                viewport={{ margin: "-45% 0px -45% 0px" }}
                className="flex flex-col justify-center gap-4 border-t border-landing-line py-10 lg:min-h-svh"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-landing-ink text-landing-gold lg:hidden">
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <span className="font-landing-label text-sm font-bold tracking-widest text-landing-muted uppercase">
                  Step {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-landing-heading text-3xl font-extrabold tracking-tight text-landing-fg sm:text-5xl">
                  {step.title}
                </h3>
                <p className="max-w-md text-lg text-landing-muted">{step.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

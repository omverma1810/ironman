"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowDown, Check } from "lucide-react";
import { HERO } from "@/lib/landing/content";
import { EASE_BRAND } from "@/lib/landing/animations";
import { ramp } from "@/lib/landing/scroll";
import { BackgroundVideo } from "./BackgroundVideo";
import { Eyebrow, Heading, LandingButton, Section } from "./ui";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } };
const item = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_BRAND } },
};

/** The first screen: the brand film plays behind the promise. As the visitor
 * scrolls, the film drifts slower than the page and swells, while the words
 * rise and fade — the page has depth, and the next section arrives over it. */
export function Hero() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const videoScale = useTransform(scrollYProgress, (p) => ramp(p, [0, 1], [1, 1.18]));
  const videoY = useTransform(scrollYProgress, (p) => `${ramp(p, [0, 1], [0, 18])}%`);
  const copyY = useTransform(scrollYProgress, (p) => ramp(p, [0, 1], [0, -90]));
  const copyOpacity = useTransform(scrollYProgress, (p) => ramp(p, [0, 0.75], [1, 0]));

  return (
    <Section
      ground="dark"
      id="home"
      ref={ref as never}
      className="isolate flex min-h-svh items-end overflow-hidden pb-24 sm:items-center sm:pb-0"
    >
      <motion.div
        aria-hidden="true"
        style={reduce ? undefined : { scale: videoScale, y: videoY }}
        className="absolute inset-0 -z-20"
      >
        <BackgroundVideo name="hero" poster="/landing/hero-poster.jpg" className="size-full object-cover" />
      </motion.div>
      {/* Keeps the words readable over any frame: heavy at the left where they
          sit, and darker toward the bottom where the next section arrives. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(90deg, rgb(0 0 0 / 0.82) 0%, rgb(0 0 0 / 0.55) 55%, rgb(0 0 0 / 0.25) 100%), linear-gradient(180deg, rgb(0 0 0 / 0.35) 0%, transparent 30%, rgb(0 0 0 / 0.75) 100%)",
        }}
      />

      <motion.div
        style={reduce ? undefined : { y: copyY, opacity: copyOpacity }}
        className="mx-auto w-full max-w-7xl px-6 pt-28 lg:pt-32"
      >
        <motion.div variants={container} initial="hidden" animate="show" className="flex max-w-3xl flex-col items-start gap-7">
          <motion.div variants={item}>
            <Eyebrow>{HERO.eyebrow}</Eyebrow>
          </motion.div>

          <motion.div variants={item}>
            <Heading as="h1" className="text-5xl sm:text-6xl lg:text-8xl">
              {HERO.title}
              <span className="hl block">{HERO.titleAccent}</span>
            </Heading>
          </motion.div>

          <motion.p
            variants={item}
            lang="hi-Latn"
            className="border-l-4 border-landing-gold pl-4 text-xl font-semibold text-landing-fg italic sm:text-2xl"
          >
            &ldquo;{HERO.quote}&rdquo;
          </motion.p>

          <motion.p variants={item} className="max-w-xl text-lg text-landing-muted sm:text-xl">
            {HERO.body}
          </motion.p>

          <motion.div variants={item} className="flex flex-wrap items-center gap-3">
            <LandingButton href="/book">Book a Pickup</LandingButton>
            <LandingButton href="#ironing" variant="outline">
              See How We Iron
            </LandingButton>
          </motion.div>

          <motion.ul variants={item} className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-landing-muted">
            {HERO.chips.map((chip) => (
              <li key={chip} className="flex items-center gap-1.5">
                <Check className="size-4 text-landing-gold" aria-hidden="true" />
                {chip}
              </li>
            ))}
          </motion.ul>
        </motion.div>
      </motion.div>

      <a
        href="#story"
        aria-label="Scroll down"
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-landing-fg/70 hover:text-landing-fg sm:block"
      >
        <motion.span
          animate={reduce ? undefined : { y: [0, 8, 0] }}
          transition={reduce ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="block"
        >
          <ArrowDown className="size-6" aria-hidden="true" />
        </motion.span>
      </a>
    </Section>
  );
}

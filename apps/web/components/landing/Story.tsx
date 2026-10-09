"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { ABOUT_VALUES, STORY } from "@/lib/landing/content";
import { mixHex, ramp } from "@/lib/landing/scroll";
import { Eyebrow, Section } from "./ui";

// Words start a readable grey (5.3:1 on white) and settle to ink as the
// visitor reads down the page. Colour, not opacity, so every word passes the
// contrast check even before it is "read".
const FROM = "#6b6b6b";
const TO = "#0a0a0a";
const MARKER = "linear-gradient(transparent 58%, #ffd60a 58%, #ffd60a 92%, transparent 92%)";

function Word({
  word,
  index,
  total,
  emphasised,
  progress,
  still,
}: {
  word: string;
  index: number;
  total: number;
  emphasised: boolean;
  progress: MotionValue<number>;
  still: boolean;
}) {
  // Each word gets its own slice of the scroll, in reading order.
  const start = (index / total) * 0.85;
  const end = start + 0.15;
  const color = useTransform(progress, (p) => mixHex(FROM, TO, ramp(p, [start, end], [0, 1])));
  const marker = useTransform(progress, (p) => `${ramp(p, [start, end], [0, 100])}% 100%`);
  return (
    <motion.span
      style={
        still
          ? { color: TO, ...(emphasised ? { backgroundImage: MARKER, backgroundRepeat: "no-repeat" } : {}) }
          : {
              color,
              ...(emphasised
                ? { backgroundImage: MARKER, backgroundRepeat: "no-repeat", backgroundSize: marker }
                : {}),
            }
      }
      className="inline-block px-1"
    >
      {word}
    </motion.span>
  );
}

/** The feeling, before the features: a few big lines that read themselves as
 * you scroll, the way the best product pages do. */
export function Story() {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.55"] });
  const words = STORY.words.split(" ");
  const emphasisStart = words.findIndex((w) => w.toLowerCase().startsWith(STORY.emphasisFrom));

  return (
    <Section ground="light" id="story" ref={ref as never} className="px-6 py-28 lg:py-40">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8">
        <Eyebrow>{STORY.eyebrow}</Eyebrow>
        <p
          lang="en-IN"
          className="leading-1.18 font-landing-heading text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-7xl"
        >
          {words.map((word, i) => (
            <Word
              key={`${word}-${i}`}
              word={word}
              index={i}
              total={words.length}
              emphasised={emphasisStart >= 0 && i >= emphasisStart}
              progress={scrollYProgress}
              still={reduce}
            />
          ))}
        </p>

        <ul className="mt-10 grid w-full grid-cols-1 gap-8 border-t border-landing-line pt-10 md:grid-cols-3">
          {ABOUT_VALUES.map((value) => (
            <li key={value.title} className="flex flex-col gap-2">
              <h3 className="font-landing-heading text-2xl font-extrabold tracking-tight text-landing-fg">
                {value.title}
              </h3>
              <p className="text-lg text-landing-muted">{value.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

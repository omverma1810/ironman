"use client";

import { useRef } from "react";
import { useScroll, useTransform, type MotionValue } from "motion/react";

/** Scroll-linked vertical parallax for one element: moves `distance`px in
 * either direction as it travels through the viewport. Used for the Hero
 * illustration and the Process section's alternating rows — Apple-style
 * "the page has depth" scroll motion, not a scroll-jacking library. */
export function useScrollParallax<T extends HTMLElement>(distance = 40): {
  ref: React.RefObject<T | null>;
  y: MotionValue<number>;
} {
  const ref = useRef<T>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  return { ref, y };
}

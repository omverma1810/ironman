"use client";

import { ReactLenis } from "lenis/react";
import { useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** Wraps the marketing page only (mounted/unmounted with it, never the
 * console/account/field apps, which rely on native scroll for
 * virtualization and modal focus handling). Falls back to plain native
 * scroll under prefers-reduced-motion, since Lenis's inertia isn't a CSS
 * animation and so isn't covered by the reduced-motion override in
 * globals.css. */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <>{children}</>;
  }

  return (
    <ReactLenis root options={{ lerp: 0.1, duration: 1.1, smoothWheel: true }}>
      {children}
    </ReactLenis>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/** A silent, looping background video that behaves itself: it holds on the
 * poster for anyone who asked for reduced motion or Data Saver, pauses when
 * scrolled out of view (no decoding, no battery, nothing to hear), and never
 * blocks the page — the poster is what paints first. Both formats are listed
 * so every browser finds one it can play. */
export function BackgroundVideo({
  name,
  poster,
  className = "",
}: {
  /** File stem under /landing, e.g. "hero" for hero.webm + hero.mp4. */
  name: string;
  poster: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ?? false;
    if (reduce || saveData) {
      video.pause();
      return;
    }
    // React renders `muted` as an attribute only, which some browsers ignore
    // for autoplay; the property is what counts.
    video.muted = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => undefined);
        else video.pause();
      },
      { threshold: 0.05 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduce]);

  return (
    <video
      ref={ref}
      className={className}
      poster={poster}
      muted
      loop
      playsInline
      autoPlay={!reduce}
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      disablePictureInPicture
    >
      <source src={`/landing/${name}.webm`} type="video/webm" />
      <source src={`/landing/${name}.mp4`} type="video/mp4" />
    </video>
  );
}

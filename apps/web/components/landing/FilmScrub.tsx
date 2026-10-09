"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { FILM } from "@/lib/landing/content";
import { ramp } from "@/lib/landing/scroll";
import { Eyebrow, Section } from "./ui";

function Caption({
  from,
  to,
  text,
  progress,
}: {
  from: number;
  to: number;
  text: string;
  progress: MotionValue<number>;
}) {
  const fade = Math.min(0.04, (to - from) / 3);
  const input = [from, from + fade, to - fade, to];
  const opacity = useTransform(progress, (p) => ramp(p, input, [0, 1, 1, 0]));
  const y = useTransform(progress, (p) => ramp(p, input, [24, 0, 0, -24]));
  return (
    <motion.p
      style={{ opacity, y, textShadow: "0 2px 16px rgb(0 0 0 / 0.8)" }}
      className="absolute inset-x-0 bottom-6 px-6 text-center font-landing-heading text-3xl leading-tight font-extrabold tracking-tight text-white sm:bottom-10 sm:text-5xl"
    >
      {text}
    </motion.p>
  );
}

/** The brand film, played by the scroll bar: the page pins the film to the
 * screen and your scrolling is the play head. It grows from a card to the
 * full frame as you arrive. Anyone who asked for reduced motion gets an
 * ordinary video with controls instead, and the file isn't fetched until the
 * section is near. */
export function FilmScrub() {
  const reduce = useReducedMotion();
  const wrapper = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const pending = useRef<number | null>(null);
  const { scrollYProgress } = useScroll({ target: wrapper, offset: ["start start", "end end"] });

  // Fetch the film only when the visitor is about to reach it.
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), {
      rootMargin: "100% 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The play head: seek to the scroll position, at most once a frame.
  useMotionValueEvent(scrollYProgress, "change", (progress) => {
    const el = video.current;
    if (!el || reduce || !Number.isFinite(el.duration)) return;
    if (pending.current !== null) cancelAnimationFrame(pending.current);
    pending.current = requestAnimationFrame(() => {
      el.currentTime = Math.min(Math.max(progress, 0), 1) * (el.duration - 0.05);
    });
  });

  const scale = useTransform(scrollYProgress, (p) => ramp(p, [0, 0.12], [0.66, 1]));
  const lift = useTransform(scrollYProgress, (p) => ramp(p, [0, 0.12], [90, 0]));
  const radius = useTransform(scrollYProgress, (p) => ramp(p, [0, 0.12], [40, 0]));
  const barWidth = useTransform(scrollYProgress, (p) => `${ramp(p, [0, 1], [0, 100])}%`);
  const titleOpacity = useTransform(scrollYProgress, (p) => ramp(p, [0, 0.08, 0.12], [1, 1, 0]));

  const player = (
    <video
      ref={video}
      muted
      playsInline
      preload={near ? "auto" : "none"}
      poster="/landing/film-poster.jpg"
      controls={!!reduce}
      aria-label="IRON MAN brand film: steam, press and finish, ending on the logo"
      className="size-full object-cover"
    >
      {near ? (
        <>
          <source src="/landing/film.webm" type="video/webm" />
          <source src="/landing/film.mp4" type="video/mp4" />
        </>
      ) : null}
    </video>
  );

  if (reduce) {
    return (
      <Section ground="dark" id="film" className="px-6 py-24">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 text-center">
          <Eyebrow>{FILM.eyebrow}</Eyebrow>
          <h2 className="font-landing-heading text-4xl font-extrabold tracking-tight sm:text-6xl">{FILM.title}</h2>
          <div ref={wrapper as never} className="aspect-video w-full overflow-hidden rounded-3xl">
            {player}
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section ground="dark" id="film" ref={wrapper as never} style={{ height: "420vh" }}>
      <div className="sticky top-0 flex h-svh items-center justify-center overflow-hidden">
        <motion.div
          style={{ opacity: titleOpacity }}
          className="pointer-events-none absolute top-24 z-10 flex flex-col items-center gap-4 px-6 text-center"
        >
          <Eyebrow>{FILM.eyebrow}</Eyebrow>
          <h2 className="font-landing-heading text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            {FILM.title}
          </h2>
        </motion.div>

        <motion.div
          style={{ scale, y: lift, borderRadius: radius }}
          className="relative aspect-video w-full max-w-350 overflow-hidden bg-black will-change-transform max-sm:aspect-3/4"
        >
          {player}
          {FILM.captions.map((caption) => (
            <Caption key={caption.text} progress={scrollYProgress} {...caption} />
          ))}
        </motion.div>

        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
          <motion.div style={{ width: barWidth }} className="h-full bg-landing-gold" />
        </div>
      </div>
    </Section>
  );
}

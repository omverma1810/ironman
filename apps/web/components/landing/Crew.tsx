"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { CREW, type CrewMember } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";
import { ramp } from "@/lib/landing/scroll";
import { Eyebrow, Heading, Section } from "./ui";

function CrewCard({ member, depth }: { member: CrewMember; depth: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLLIElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const artY = useTransform(scrollYProgress, (p) => ramp(p, [0, 1], [depth, -depth]));

  return (
    <motion.li
      ref={ref}
      variants={fadeUp}
      className="flex flex-col overflow-hidden rounded-4xl bg-landing-card shadow-landing-lift"
    >
      <div className="relative aspect-4/3 overflow-hidden bg-landing-line">
        <motion.div style={reduce ? undefined : { y: artY }} className="absolute inset-0 scale-110">
          <Image
            src={member.photo}
            alt={member.alt}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 33vw, 100vw"
            className="object-cover"
          />
        </motion.div>
      </div>
      <div className="flex flex-col gap-2 p-7">
        <h3 className="font-landing-heading text-2xl font-extrabold tracking-tight text-landing-fg">{member.role}</h3>
        <p className="text-landing-muted">{member.line}</p>
      </div>
    </motion.li>
  );
}

export function Crew() {
  return (
    <Section ground="dark" id="crew" className="overflow-hidden px-6 py-24 lg:py-36">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
        <Eyebrow>The crew</Eyebrow>
        <Heading>
          The crew behind <span className="hl">your crisp clothes.</span>
        </Heading>
        <p className="text-lg text-landing-muted">{CREW.body}</p>
      </div>

      <motion.ul
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.12 }}
        className="mx-auto mt-16 grid max-w-7xl grid-cols-1 gap-6 md:grid-cols-3"
      >
        {CREW.members.map((member, i) => (
          <CrewCard key={member.key} member={member} depth={[22, 38, 22][i]} />
        ))}
      </motion.ul>
    </Section>
  );
}

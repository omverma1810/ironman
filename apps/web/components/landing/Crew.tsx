"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { CREW, type CrewMember } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";
import { ramp } from "@/lib/landing/scroll";
import { Eyebrow, Heading, Section } from "./ui";

const INK = "#0a0a0a";
const GOLD = "#ffd60a";
const WHITE = "#ffffff";
const GREY = "#3a3a3a";
const stroke = { stroke: INK, strokeWidth: 5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** The three people behind an order, drawn in the brand's flat black, white
 * and yellow. These stand in until there are real photos: put the file under
 * /public/crew and set `photo` on the member in content.ts. */
function RiderArt() {
  return (
    <svg viewBox="0 0 400 300" className="size-full" role="img" aria-label="A rider on a scooter with a yellow delivery box">
      <line x1="20" y1="262" x2="380" y2="262" stroke={WHITE} strokeWidth="4" strokeDasharray="14 18" opacity="0.5" />
      {/* box on the back */}
      <rect x="60" y="92" width="92" height="76" rx="10" fill={GOLD} {...stroke} />
      <path d="M60 118 H152" {...stroke} />
      {/* scooter */}
      <path d="M118 214 H292 Q312 214 312 196 L298 150 H264 L252 188 H146 Z" fill={WHITE} {...stroke} />
      <path d="M270 150 L282 86 H306" fill="none" {...stroke} />
      <circle cx="118" cy="232" r="32" fill={INK} stroke={WHITE} strokeWidth="5" />
      <circle cx="292" cy="232" r="32" fill={INK} stroke={WHITE} strokeWidth="5" />
      <circle cx="118" cy="232" r="10" fill={GOLD} />
      <circle cx="292" cy="232" r="10" fill={GOLD} />
      {/* rider */}
      <path d="M168 190 L176 128 Q180 108 204 108 Q232 108 232 132 L226 190 Z" fill={GOLD} {...stroke} />
      <path d="M226 124 L282 94" fill="none" {...stroke} strokeWidth={14} stroke={INK} />
      <path d="M226 124 L282 94" fill="none" stroke={GOLD} strokeWidth={6} strokeLinecap="round" />
      <path d="M180 188 L196 236 H232" fill="none" {...stroke} strokeWidth={14} />
      <circle cx="206" cy="82" r="24" fill={WHITE} {...stroke} />
      <path d="M180 78 Q184 52 208 52 Q232 52 232 80 Z" fill={GOLD} {...stroke} />
    </svg>
  );
}

function PresserArt() {
  return (
    <svg viewBox="0 0 400 300" className="size-full" role="img" aria-label="An ironing specialist pressing a shirt at a station">
      <rect x="40" y="206" width="320" height="22" rx="8" fill={WHITE} {...stroke} />
      <path d="M96 228 L80 270 M304 228 L320 270" {...stroke} />
      {/* shirt on the table */}
      <path d="M120 206 L120 176 Q150 160 200 166 Q250 160 280 176 L280 206 Z" fill={GOLD} {...stroke} />
      <path d="M170 166 L200 188 L230 166" fill="none" {...stroke} />
      {/* iron */}
      <path d="M214 174 Q216 140 252 132 H294 Q300 132 300 138 V174 Z" fill={GREY} {...stroke} />
      <rect x="210" y="170" width="94" height="10" rx="5" fill={INK} />
      <path d="M244 132 Q244 114 262 114 H284" fill="none" {...stroke} />
      {/* steam */}
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${228 + i * 22} 112 q-8 -12 0 -24 q8 -12 0 -24`} fill="none" stroke={WHITE} strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      ))}
      {/* person */}
      <path d="M96 206 L104 120 Q108 100 132 100 Q158 100 160 124 L166 206 Z" fill={INK} stroke={WHITE} strokeWidth="4" strokeLinejoin="round" />
      <path d="M112 112 L148 112 L150 206 H110 Z" fill={GOLD} {...stroke} />
      <path d="M154 130 L214 160" fill="none" stroke={INK} strokeWidth={15} strokeLinecap="round" />
      <path d="M154 130 L214 160" fill="none" stroke={WHITE} strokeWidth={6} strokeLinecap="round" />
      <circle cx="132" cy="74" r="24" fill={WHITE} {...stroke} />
      <path d="M108 70 Q110 46 134 46 Q158 46 158 70 Z" fill={INK} stroke={WHITE} strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

function CheckerArt() {
  return (
    <svg viewBox="0 0 400 300" className="size-full" role="img" aria-label="A quality checker holding up a pressed shirt to inspect it">
      {/* shirt held up */}
      <line x1="262" y1="54" x2="262" y2="74" stroke={WHITE} strokeWidth="5" strokeLinecap="round" />
      <path d="M262 54 L242 72 L212 84 L196 122 L218 136 L230 122 L230 232 Q230 244 242 244 L282 244 Q294 244 294 232 L294 122 L306 136 L328 122 L312 84 L282 72 Z" fill={GOLD} {...stroke} />
      <path d="M244 84 Q262 100 280 84" fill="none" {...stroke} />
      <path d="M248 138 V226 M262 142 V232 M276 138 V226" stroke={INK} strokeWidth="3" strokeLinecap="round" opacity="0.4" />
      {/* sparkles */}
      {[[336, 70], [188, 64], [340, 190]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 14} L${x + 4} ${y - 4} L${x + 14} ${y} L${x + 4} ${y + 4} L${x} ${y + 14} L${x - 4} ${y + 4} L${x - 14} ${y} L${x - 4} ${y - 4} Z`} fill={WHITE} />
      ))}
      {/* person */}
      <path d="M62 262 L70 148 Q74 128 100 128 Q128 128 130 150 L136 262 Z" fill={INK} stroke={WHITE} strokeWidth="4" strokeLinejoin="round" />
      <path d="M80 140 L120 140 L124 262 H76 Z" fill={WHITE} {...stroke} />
      <path d="M116 150 L206 112" fill="none" stroke={INK} strokeWidth={15} strokeLinecap="round" />
      <path d="M116 150 L206 112" fill="none" stroke={WHITE} strokeWidth={6} strokeLinecap="round" />
      <circle cx="100" cy="100" r="24" fill={WHITE} {...stroke} />
      <path d="M76 96 Q78 72 102 72 Q126 72 126 96 Z" fill={GOLD} {...stroke} />
    </svg>
  );
}

const ART: Record<CrewMember["key"], () => React.JSX.Element> = {
  rider: RiderArt,
  presser: PresserArt,
  checker: CheckerArt,
};

function CrewCard({ member, depth }: { member: CrewMember; depth: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLLIElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const artY = useTransform(scrollYProgress, (p) => ramp(p, [0, 1], [depth, -depth]));
  const glowY = useTransform(scrollYProgress, (p) => ramp(p, [0, 1], [-depth, depth]));
  const Art = ART[member.key];

  return (
    <motion.li
      ref={ref}
      variants={fadeUp}
      className="flex flex-col overflow-hidden rounded-4xl bg-landing-card shadow-landing-lift"
    >
      <div className="relative aspect-4/3 overflow-hidden bg-landing-gold/10">
        {member.photo ? (
          <Image src={member.photo} alt={member.role} fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
        ) : (
          <>
            <motion.div
              aria-hidden="true"
              style={reduce ? undefined : { y: glowY }}
              className="absolute -top-10 -right-10 size-56 rounded-full bg-landing-gold/25 blur-2xl"
            />
            <motion.div style={reduce ? undefined : { y: artY }} className="absolute inset-0 scale-110 p-4">
              <Art />
            </motion.div>
          </>
        )}
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

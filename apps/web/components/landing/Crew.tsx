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
const SKIN = "#d9a47a";
const HAIR = "#1f1612";
const STEEL = "#2a2e35";
const stroke = { stroke: INK, strokeWidth: 4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** The three roles behind an order, drawn in full colour: natural skin and
 * fabric tones, steel machinery, with brand yellow kept as an accent rather
 * than the colour of everything. They stand in until there are real photos:
 * put the file under /public/crew and set `photo` on the member in
 * content.ts. */
function Backdrop({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id})`} />
    </>
  );
}

function RiderArt() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full" role="img" aria-label="A rider on a scooter with a yellow delivery box">
      <Backdrop id="rb" from="#dfe9f4" to="#b9c8d8" />
      <rect y="248" width="400" height="52" fill="#4a4f57" />
      <line x1="20" y1="274" x2="380" y2="274" stroke={WHITE} strokeWidth="4" strokeDasharray="14 18" opacity="0.7" />
      {/* box on the back */}
      <rect x="56" y="92" width="96" height="78" rx="10" fill={GOLD} {...stroke} />
      <path d="M56 118 H152" {...stroke} />
      <rect x="90" y="132" width="28" height="12" rx="4" fill={INK} />
      {/* scooter */}
      <path d="M118 214 H292 Q312 214 312 196 L298 150 H264 L252 188 H146 Z" fill="#e8ecf1" {...stroke} />
      <path d="M270 150 L282 86 H306" fill="none" {...stroke} />
      <circle cx="118" cy="232" r="32" fill={INK} stroke="#9aa2ad" strokeWidth="5" />
      <circle cx="292" cy="232" r="32" fill={INK} stroke="#9aa2ad" strokeWidth="5" />
      <circle cx="118" cy="232" r="10" fill="#cfd5dc" />
      <circle cx="292" cy="232" r="10" fill="#cfd5dc" />
      {/* rider */}
      <path d="M180 188 L196 236 H232" fill="none" stroke="#2f4b7c" strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M168 190 L176 128 Q180 108 204 108 Q232 108 232 132 L226 190 Z" fill="#1a1d22" {...stroke} />
      <path d="M176 134 H230" stroke={GOLD} strokeWidth="7" />
      <path d="M226 124 L282 94" fill="none" stroke="#1a1d22" strokeWidth={15} strokeLinecap="round" />
      <circle cx="284" cy="93" r="8" fill={SKIN} />
      <circle cx="206" cy="82" r="22" fill={SKIN} {...stroke} />
      <path d="M180 82 Q180 54 208 54 Q234 54 234 84 L214 84 Q200 78 180 82 Z" fill={INK} {...stroke} />
      <rect x="196" y="58" width="22" height="7" rx="3.5" fill={GOLD} />
    </svg>
  );
}

/** The ironing specialist is a friendly press-bot, not a person with a hand
 * iron: IRON MAN presses by machine. The glowing yellow rings echo the ones
 * on the real machines in the brand film. */
function PresserArt() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full" role="img" aria-label="A friendly press robot waving beside an automatic garment press, with a stack of pressed shirts">
      <defs>
        <linearGradient id="pb-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6ecf3" />
          <stop offset="1" stopColor="#bcc8d6" />
        </linearGradient>
        <linearGradient id="pb-shell" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c9d1db" />
        </linearGradient>
        <linearGradient id="pb-bed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4b5059" />
          <stop offset="1" stopColor="#1e2126" />
        </linearGradient>
        <linearGradient id="pb-plate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7dde5" />
          <stop offset="1" stopColor="#8d97a5" />
        </linearGradient>
        <radialGradient id="pb-steam" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="300" fill="url(#pb-bg)" />
      {/* press bed */}
      <rect y="228" width="400" height="72" fill="url(#pb-bed)" />
      <rect x="30" y="234" width="340" height="6" rx="3" fill={GOLD} />
      {/* stack of pressed shirts */}
      <rect x="36" y="206" width="104" height="22" rx="6" fill="#f4f6fb" {...stroke} strokeWidth={3} />
      <rect x="44" y="188" width="90" height="20" rx="6" fill="#a9c4ef" {...stroke} strokeWidth={3} />
      <rect x="52" y="172" width="76" height="18" rx="6" fill="#ffffff" {...stroke} strokeWidth={3} />
      <path d="M78 172 L90 182 L102 172" fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      {/* waving arm */}
      <path d="M154 170 L114 154 L98 108" fill="none" stroke={INK} strokeWidth={19} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M154 170 L114 154 L98 108" fill="none" stroke={STEEL} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="114" cy="154" r="11" fill={STEEL} stroke={GOLD} strokeWidth="4" />
      <circle cx="96" cy="100" r="14" fill="url(#pb-shell)" {...stroke} strokeWidth={3} />
      {/* body */}
      <rect x="150" y="146" width="100" height="92" rx="28" fill="url(#pb-shell)" {...stroke} />
      <rect x="172" y="164" width="56" height="38" rx="12" fill={INK} />
      <circle cx="200" cy="183" r="11" fill="none" stroke={GOLD} strokeWidth="4" />
      <circle cx="200" cy="183" r="3" fill={GOLD} />
      {/* head */}
      <line x1="200" y1="30" x2="200" y2="52" stroke={STEEL} strokeWidth="5" strokeLinecap="round" />
      <circle cx="200" cy="27" r="8" fill={GOLD} {...stroke} strokeWidth={3} />
      <circle cx="136" cy="96" r="10" fill={GOLD} {...stroke} strokeWidth={3} />
      <circle cx="264" cy="96" r="10" fill={GOLD} {...stroke} strokeWidth={3} />
      <rect x="140" y="52" width="120" height="88" rx="36" fill="url(#pb-shell)" {...stroke} />
      <rect x="154" y="68" width="92" height="54" rx="26" fill={INK} />
      <rect x="172" y="84" width="15" height="22" rx="7.5" fill={GOLD} />
      <rect x="213" y="84" width="15" height="22" rx="7.5" fill={GOLD} />
      <path d="M186 110 Q200 120 214 110" fill="none" stroke={GOLD} strokeWidth="4" strokeLinecap="round" />
      <rect x="188" y="136" width="24" height="12" rx="4" fill="#8f99a8" />
      {/* press arm and plate */}
      <path d="M250 172 L292 158 L322 184" fill="none" stroke={INK} strokeWidth={19} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M250 172 L292 158 L322 184" fill="none" stroke={STEEL} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="292" cy="158" r="11" fill={STEEL} stroke={GOLD} strokeWidth="4" />
      <rect x="286" y="190" width="84" height="30" rx="7" fill="url(#pb-plate)" {...stroke} strokeWidth={3} />
      <rect x="286" y="212" width="84" height="8" rx="4" fill={GOLD} />
      <rect x="318" y="176" width="20" height="16" rx="3" fill={STEEL} />
      {/* steam */}
      <circle cx="304" cy="182" r="22" fill="url(#pb-steam)" />
      <circle cx="338" cy="172" r="26" fill="url(#pb-steam)" />
      <circle cx="366" cy="184" r="18" fill="url(#pb-steam)" />
      {/* sparkles */}
      {[[104, 60], [300, 66], [64, 128]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 11} L${x + 3} ${y - 3} L${x + 11} ${y} L${x + 3} ${y + 3} L${x} ${y + 11} L${x - 3} ${y + 3} L${x - 11} ${y} L${x - 3} ${y - 3} Z`} fill={GOLD} />
      ))}
    </svg>
  );
}

function CheckerArt() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full" role="img" aria-label="A quality checker holding up a pressed shirt to inspect it">
      <Backdrop id="cb" from="#eceff3" to="#c5cdd8" />
      <rect y="262" width="400" height="38" fill="#6b7280" opacity="0.35" />
      {/* shirt held up */}
      <line x1="262" y1="50" x2="262" y2="74" stroke="#7b8494" strokeWidth="5" strokeLinecap="round" />
      <path d="M262 52 L242 72 L212 84 L196 122 L218 136 L230 122 L230 232 Q230 244 242 244 L282 244 Q294 244 294 232 L294 122 L306 136 L328 122 L312 84 L282 72 Z" fill="#cfe0fb" {...stroke} />
      <path d="M244 84 Q262 100 280 84" fill="#ffffff" {...stroke} strokeWidth={3} />
      <rect x="244" y="132" width="20" height="24" rx="3" fill="none" stroke={INK} strokeWidth="2.5" opacity="0.5" />
      <path d="M262 100 V240" stroke={INK} strokeWidth="2.5" strokeDasharray="3 9" opacity="0.3" />
      {/* sparkles */}
      {[[336, 70], [188, 64], [340, 190]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 14} L${x + 4} ${y - 4} L${x + 14} ${y} L${x + 4} ${y + 4} L${x} ${y + 14} L${x - 4} ${y + 4} L${x - 14} ${y} L${x - 4} ${y - 4} Z`} fill={GOLD} stroke={INK} strokeWidth="1.5" />
      ))}
      {/* person */}
      <path d="M62 264 L70 150 Q74 130 100 130 Q128 130 130 152 L136 264 Z" fill="#f5f6f8" {...stroke} />
      <path d="M96 132 L104 160 L112 132" fill="none" {...stroke} strokeWidth={3} />
      <rect x="84" y="176" width="26" height="30" rx="4" fill="none" stroke={INK} strokeWidth="2.5" opacity="0.45" />
      <path d="M116 152 L206 114" fill="none" stroke="#f5f6f8" strokeWidth={15} strokeLinecap="round" />
      <circle cx="208" cy="113" r="8" fill={SKIN} />
      <circle cx="100" cy="102" r="22" fill={SKIN} {...stroke} />
      <path d="M78 98 Q78 76 102 76 Q124 76 124 98 Q112 90 100 92 Q88 90 78 98 Z" fill={HAIR} {...stroke} strokeWidth={3} />
      <rect x="86" y="146" width="30" height="8" rx="4" fill={GOLD} />
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
  const Art = ART[member.key];

  return (
    <motion.li
      ref={ref}
      variants={fadeUp}
      className="flex flex-col overflow-hidden rounded-4xl bg-landing-card shadow-landing-lift"
    >
      <div className="relative aspect-4/3 overflow-hidden bg-landing-line">
        {member.photo ? (
          <Image src={member.photo} alt={member.role} fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
        ) : (
          <>
            <motion.div style={reduce ? undefined : { y: artY }} className="absolute inset-0 scale-110">
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

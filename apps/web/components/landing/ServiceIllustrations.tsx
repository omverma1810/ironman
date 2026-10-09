import type { Service } from "@/lib/landing/content";

/** One full-colour scene per service. These stand in for photography until
 * real shots exist: drop a file under /public/services and set `photo` on
 * the service in content.ts and it replaces the illustration. They use the
 * garment's natural colours on a soft neutral ground, with brand yellow kept
 * as an accent (a belt, a LED strip, a badge) instead of the colour of
 * everything. */

const INK = "#14161a";
const GOLD = "#ffd60a";
const line = { stroke: INK, strokeWidth: 3.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Ground({ id, from, to }: { id: string; from: string; to: string }) {
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

function Stand({ x = 200 }: { x?: number }) {
  return (
    <>
      <ellipse cx={x} cy="282" rx="58" ry="9" fill={INK} opacity="0.18" />
      <rect x={x - 4} y="236" width="8" height="42" rx="3" fill="#6d7480" />
      <ellipse cx={x} cy="278" rx="40" ry="7" fill="#4b515b" />
    </>
  );
}

function DryCleaningArt() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full" role="img" aria-label="A navy suit jacket on a hanger inside a clear garment bag">
      <Ground id="dc-g" from="#eef1f6" to="#cdd6e4" />
      <defs>
        <linearGradient id="dc-suit" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2c4377" />
          <stop offset="0.5" stopColor="#233765" />
          <stop offset="1" stopColor="#1a2a52" />
        </linearGradient>
      </defs>
      <rect x="40" y="22" width="320" height="6" rx="3" fill="#7b8494" />
      <path d="M200 28 V42 q0 8 10 10" fill="none" stroke="#7b8494" strokeWidth="5" strokeLinecap="round" />
      <path d="M200 52 L142 82 H258 Z" fill="none" stroke="#b08a5a" strokeWidth="6" strokeLinejoin="round" />
      {/* jacket */}
      <path
        d="M200 70 L162 84 L124 100 L110 168 L136 176 L146 140 L146 250 Q146 262 160 262 L240 262 Q254 262 254 250 L254 140 L264 176 L290 168 L276 100 L238 84 Z"
        fill="url(#dc-suit)"
        {...line}
      />
      <path d="M200 70 L182 84 L196 150 L200 196 L204 150 L218 84 Z" fill="#f7f8fb" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M182 84 L160 108 L184 150 L196 150 Z M218 84 L240 108 L216 150 L204 150 Z" fill="#1b2c55" {...line} strokeWidth={3} />
      <circle cx="200" cy="206" r="4" fill="#0e1630" />
      <path d="M226 168 H250" stroke={GOLD} strokeWidth="5" strokeLinecap="round" />
      {/* clear garment bag */}
      <path d="M108 74 Q200 40 292 74 L300 252 Q300 276 276 276 H124 Q100 276 100 252 Z" fill="#ffffff" fillOpacity="0.28" stroke="#ffffff" strokeWidth="3" strokeOpacity="0.9" />
      <path d="M200 44 V272" stroke="#ffffff" strokeWidth="2.5" strokeDasharray="3 8" opacity="0.8" />
      <path d="M124 110 Q132 170 124 236" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function WashFoldArt() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full" role="img" aria-label="A front-loading washing machine next to a stack of neatly folded colourful laundry">
      <Ground id="wf-g" from="#e8f3f6" to="#c6dde4" />
      <defs>
        <linearGradient id="wf-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d3dae2" />
        </linearGradient>
        <radialGradient id="wf-glass" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#7fc4ec" />
          <stop offset="1" stopColor="#1e5f94" />
        </radialGradient>
      </defs>
      <ellipse cx="200" cy="270" rx="170" ry="10" fill={INK} opacity="0.14" />
      <rect x="40" y="48" width="140" height="216" rx="16" fill="url(#wf-body)" {...line} />
      <rect x="54" y="62" width="112" height="22" rx="6" fill="#e6ebf0" stroke={INK} strokeWidth="2.5" />
      <circle cx="70" cy="73" r="5" fill="#8b95a3" />
      <rect x="86" y="68" width="38" height="10" rx="5" fill={INK} />
      <circle cx="146" cy="73" r="5" fill={GOLD} stroke={INK} strokeWidth="2" />
      <circle cx="110" cy="170" r="52" fill="#c9d1db" {...line} />
      <circle cx="110" cy="170" r="40" fill="url(#wf-glass)" stroke={INK} strokeWidth="3" />
      <path d="M78 178 Q94 150 114 168 Q132 186 146 156" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity="0.65" />
      <circle cx="92" cy="154" r="6" fill="#ffffff" opacity="0.4" />
      {/* folded stack */}
      <rect x="214" y="206" width="150" height="30" rx="8" fill="#2aa198" {...line} strokeWidth={3} />
      <rect x="222" y="178" width="134" height="30" rx="8" fill="#f4f6f9" {...line} strokeWidth={3} />
      <rect x="216" y="150" width="146" height="30" rx="8" fill="#ef6f5e" {...line} strokeWidth={3} />
      <rect x="226" y="122" width="126" height="30" rx="8" fill="#e8b92e" {...line} strokeWidth={3} />
      <path d="M232 192 H346 M226 164 H350 M236 136 H342" stroke={INK} strokeWidth="2" opacity="0.18" />
      <circle cx="324" cy="108" r="6" fill="#ffffff" stroke="#7fc4ec" strokeWidth="2" />
      <circle cx="338" cy="94" r="4" fill="#ffffff" stroke="#7fc4ec" strokeWidth="2" />
    </svg>
  );
}

function SareeArt() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full" role="img" aria-label="A magenta silk saree with a gold border, draped on a dress form with the pallu over the shoulder">
      <Ground id="sr-g" from="#f8ecef" to="#e8cdd7" />
      <defs>
        <linearGradient id="sr-silk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8d0f4b" />
          <stop offset="0.45" stopColor="#c21a6c" />
          <stop offset="1" stopColor="#7a0a41" />
        </linearGradient>
      </defs>
      <Stand />
      {/* pleated skirt of the saree */}
      <path d="M168 150 L232 150 L282 252 Q200 268 118 252 Z" fill="url(#sr-silk)" {...line} />
      <path d="M180 152 L150 258 M192 152 L176 262 M204 152 L202 264 M216 152 L228 262 M228 152 L254 258" stroke="#5e0834" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      <path d="M121 238 Q200 254 279 238 L282 252 Q200 268 118 252 Z" fill={GOLD} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M126 245 Q200 260 274 245" fill="none" stroke="#b8860b" strokeWidth="2.5" strokeDasharray="6 6" />
      {/* blouse and form */}
      <path d="M170 150 Q160 100 166 66 Q200 52 234 66 Q240 100 230 150 Z" fill="#f2e2c4" {...line} />
      <path d="M186 60 Q200 70 214 60" fill="none" stroke={INK} strokeWidth="3" />
      {/* pallu over the shoulder */}
      <path d="M166 68 Q214 72 258 168 L292 246 L258 244 Q226 164 176 96 Z" fill="url(#sr-silk)" {...line} />
      <path d="M176 96 Q226 164 258 244" fill="none" stroke={GOLD} strokeWidth="7" strokeLinecap="round" />
      <path d="M262 168 L292 246" stroke={GOLD} strokeWidth="5" strokeLinecap="round" opacity="0.9" />
      <rect x="170" y="144" width="62" height="9" rx="3" fill={GOLD} stroke={INK} strokeWidth="2.5" />
    </svg>
  );
}

function DesignerGarmentArt() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full" role="img" aria-label="An emerald satin evening gown with a gold belt on a dress form under a soft spotlight">
      <defs>
        <radialGradient id="og-g" cx="0.5" cy="0.35" r="0.85">
          <stop offset="0" stopColor="#fbf6ea" />
          <stop offset="1" stopColor="#d9cfbb" />
        </radialGradient>
        <linearGradient id="og-satin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0b5a46" />
          <stop offset="0.38" stopColor="#1fa07c" />
          <stop offset="0.55" stopColor="#0e7d5f" />
          <stop offset="1" stopColor="#084434" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#og-g)" />
      <Stand />
      {/* skirt */}
      <path d="M172 134 L228 134 Q262 200 290 262 Q200 282 110 262 Q138 200 172 134 Z" fill="url(#og-satin)" {...line} />
      <path d="M186 140 Q170 206 152 268 M200 140 V274 M214 140 Q232 206 250 268" fill="none" stroke="#06382b" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
      <path d="M196 170 Q190 218 178 262" fill="none" stroke="#bff1de" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
      {/* bodice */}
      <path d="M172 134 Q166 100 168 76 Q184 90 200 80 Q216 90 232 76 Q234 100 228 134 Z" fill="url(#og-satin)" {...line} />
      <path d="M168 76 Q184 98 200 86 Q216 98 232 76" fill="none" stroke={INK} strokeWidth="3" />
      <path d="M178 76 Q176 56 186 50 M222 76 Q224 56 214 50" fill="none" stroke="#0a4a39" strokeWidth="6" strokeLinecap="round" />
      {/* gold belt */}
      <rect x="168" y="128" width="64" height="12" rx="4" fill={GOLD} stroke={INK} strokeWidth="3" />
      <rect x="192" y="125" width="16" height="18" rx="4" fill="#fff3a6" stroke={INK} strokeWidth="2.5" />
      {/* sparkle */}
      {[[96, 70], [312, 96], [330, 200]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 12} L${x + 3.5} ${y - 3.5} L${x + 12} ${y} L${x + 3.5} ${y + 3.5} L${x} ${y + 12} L${x - 3.5} ${y + 3.5} L${x - 12} ${y} L${x - 3.5} ${y - 3.5} Z`} fill={GOLD} stroke="#b8860b" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

function SneakerArt() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full" role="img" aria-label="A white sneaker with a navy stripe being scrubbed with a brush, with soap bubbles">
      <Ground id="sn-g" from="#e8f0e8" to="#c9d8cc" />
      <ellipse cx="196" cy="246" rx="132" ry="9" fill={INK} opacity="0.15" />
      {/* sole */}
      <path d="M72 214 Q70 238 94 240 L300 240 Q330 238 330 214 L330 204 L72 204 Z" fill="#e9edf1" {...line} />
      <path d="M80 228 H322" stroke="#b6bec8" strokeWidth="3" strokeDasharray="10 8" />
      {/* upper */}
      <path d="M74 206 Q74 176 106 170 L150 160 Q170 124 214 120 Q240 120 254 140 L296 152 Q330 160 330 190 L330 206 Z" fill="#ffffff" {...line} />
      <path d="M150 160 L178 192 M184 148 L208 182 M216 138 L238 170" stroke={INK} strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
      <path d="M214 120 Q240 120 254 140 L296 152 L300 168 Q250 150 214 150 Z" fill="#e3e8ee" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M96 192 Q150 214 280 190 Q310 184 328 192" fill="none" stroke="#243b6b" strokeWidth="9" strokeLinecap="round" />
      <path d="M74 188 Q70 176 82 170 L94 172 L90 204 Q76 204 74 188 Z" fill={GOLD} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M96 182 Q90 186 96 200" stroke={INK} strokeWidth="2.5" fill="none" />
      {/* brush */}
      <g transform="translate(236 52) rotate(28)">
        <rect x="0" y="22" width="92" height="22" rx="8" fill="#b9814a" {...line} strokeWidth={3} />
        <rect x="4" y="44" width="62" height="14" rx="3" fill="#e9d9b0" stroke={INK} strokeWidth="2.5" />
        <path d="M10 58 v10 M20 58 v10 M30 58 v10 M40 58 v10 M50 58 v10 M60 58 v10" stroke="#8a6a3f" strokeWidth="3" strokeLinecap="round" />
      </g>
      {[[264, 150, 9], [284, 126, 6], [244, 120, 5], [310, 148, 7]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#ffffff" fillOpacity="0.85" stroke="#7fc4ec" strokeWidth="2" />
      ))}
    </svg>
  );
}

function ExpressArt() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full" role="img" aria-label="A stopwatch with a yellow lightning badge, for same-day delivery">
      <Ground id="ex-g" from="#f6f1e0" to="#e4dab5" />
      <defs>
        <linearGradient id="ex-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a5160" />
          <stop offset="1" stopColor="#14161a" />
        </linearGradient>
      </defs>
      <ellipse cx="200" cy="262" rx="96" ry="10" fill={INK} opacity="0.18" />
      <rect x="184" y="40" width="32" height="20" rx="5" fill="#6d7480" {...line} strokeWidth={3} />
      <rect x="192" y="56" width="16" height="14" fill="#8b95a3" stroke={INK} strokeWidth="3" />
      <line x1="248" y1="64" x2="266" y2="46" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <circle cx="200" cy="168" r="92" fill="url(#ex-rim)" {...line} />
      <circle cx="200" cy="168" r="76" fill="#fbfbfc" stroke={INK} strokeWidth="3" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        const x1 = 200 + Math.sin(a) * 66;
        const y1 = 168 - Math.cos(a) * 66;
        const x2 = 200 + Math.sin(a) * 74;
        const y2 = 168 - Math.cos(a) * 74;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={i % 3 === 0 ? 4 : 2} strokeLinecap="round" />;
      })}
      <path d="M200 168 L200 120" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M200 168 L238 186" stroke="#d93a3a" strokeWidth="4" strokeLinecap="round" />
      <circle cx="200" cy="168" r="7" fill={INK} />
      <circle cx="286" cy="86" r="30" fill={GOLD} stroke={INK} strokeWidth="4" />
      <path d="M292 68 L274 90 L286 90 L280 106 L300 82 L288 82 Z" fill={INK} />
    </svg>
  );
}

export const SERVICE_ILLUSTRATIONS: Record<Service["slug"], React.ComponentType> = {
  "dry-cleaning": DryCleaningArt,
  "wash-fold": WashFoldArt,
  "designer-garment": DesignerGarmentArt,
  "shoe-sneaker": SneakerArt,
  "saree-drapery": SareeArt,
  express: ExpressArt,
};

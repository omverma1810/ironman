import type { Service } from "@/lib/landing/content";

/** One hand-drawn line-art scene per service — a solid gold silhouette
 * with a dark ink outline on a black ground, matching the real IronMan
 * logo's own treatment (flat gold shapes, no gradients). Stands in for
 * the photography a normal deployment would use: this sandbox's network
 * policy blocks every photo CDN (Unsplash, Pexels, even plain picsum),
 * so nothing here could be verified as a real, working image URL before
 * shipping it. */

function DryCleaningArt() {
  return (
    <svg viewBox="0 0 400 300" className="size-full" role="img" aria-label="A suit jacket on a hanger in a garment bag">
      <rect width="400" height="300" fill="var(--landing-gold)" opacity="0.1" />
      <line x1="200" y1="40" x2="200" y2="60" stroke="var(--landing-gold)" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M200 40 L160 66 L128 82 L112 130 L138 148 L152 130 L152 236 Q152 250 166 250 L234 250 Q248 250 248 236 L248 130 L262 148 L296 130 L272 82 L240 66 Z"
        fill="var(--landing-gold)"
        stroke="var(--landing-ink)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M178 82 L178 210 M222 82 L222 210" stroke="var(--landing-ink)" strokeWidth="3" opacity="0.6" />
      <rect x="96" y="54" width="208" height="210" rx="18" fill="none" stroke="var(--landing-gold)" strokeWidth="2.5" strokeDasharray="2 10" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function WashFoldArt() {
  return (
    <svg viewBox="0 0 400 300" className="size-full" role="img" aria-label="A stack of folded laundry beside a washing machine">
      <rect width="400" height="300" fill="var(--landing-gold)" opacity="0.1" />
      <rect x="70" y="70" width="130" height="160" rx="14" fill="var(--landing-gold)" stroke="var(--landing-ink)" strokeWidth="4" />
      <rect x="86" y="86" width="98" height="14" rx="4" fill="var(--landing-ink)" opacity="0.5" />
      <circle cx="135" cy="160" r="46" fill="var(--landing-ink)" stroke="var(--landing-ink)" strokeWidth="4" opacity="0.9" />
      <path d="M110 150 Q135 175 160 150" fill="none" stroke="var(--landing-gold)" strokeWidth="4" strokeLinecap="round" />
      <g transform="translate(220,120)">
        <rect x="0" y="40" width="120" height="18" rx="6" fill="var(--landing-gold)" stroke="var(--landing-ink)" strokeWidth="3" />
        <rect x="10" y="18" width="100" height="18" rx="6" fill="var(--landing-gold)" stroke="var(--landing-ink)" strokeWidth="3" />
        <rect x="0" y="-4" width="120" height="18" rx="6" fill="var(--landing-gold)" stroke="var(--landing-ink)" strokeWidth="3" />
      </g>
    </svg>
  );
}

function DesignerGarmentArt() {
  return (
    <svg viewBox="0 0 400 300" className="size-full" role="img" aria-label="A premium hanging dress with a care tag">
      <rect width="400" height="300" fill="var(--landing-gold)" opacity="0.1" />
      <line x1="200" y1="44" x2="200" y2="66" stroke="var(--landing-gold)" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M200 44 L172 66 L150 96 L160 236 Q160 250 176 250 L224 250 Q240 250 240 236 L250 96 L228 66 Z"
        fill="var(--landing-gold)"
        stroke="var(--landing-ink)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M182 96 Q200 112 218 96" fill="none" stroke="var(--landing-ink)" strokeWidth="4" strokeLinecap="round" />
      <g transform="translate(258,150) rotate(18)">
        <rect x="0" y="0" width="44" height="26" rx="4" fill="var(--landing-gold)" stroke="var(--landing-ink)" strokeWidth="2" />
        <circle cx="10" cy="13" r="3" fill="var(--landing-ink)" />
      </g>
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${140 - i * 14} ${70 + i * 10} l6 -10 l6 10 z`}
          fill="var(--landing-gold)"
          opacity={0.5 - i * 0.12}
        />
      ))}
    </svg>
  );
}

function SneakerArt() {
  return (
    <svg viewBox="0 0 400 300" className="size-full" role="img" aria-label="A sneaker being cleaned with a brush">
      <rect width="400" height="300" fill="var(--landing-gold)" opacity="0.1" />
      <path
        d="M90 210 Q90 190 116 186 L160 178 Q182 150 214 150 Q236 150 250 168 L292 176 Q312 180 312 202 L312 214 Q312 224 300 224 L104 224 Q90 224 90 210 Z"
        fill="var(--landing-gold)"
        stroke="var(--landing-ink)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M160 178 L182 200 M188 168 L206 196 M216 158 L232 192" stroke="var(--landing-ink)" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      <rect x="90" y="224" width="222" height="14" rx="6" fill="var(--landing-ink)" opacity="0.4" />
      <g transform="translate(230,90) rotate(35)">
        <rect x="0" y="0" width="70" height="16" rx="8" fill="var(--landing-gold)" />
        <rect x="4" y="4" width="30" height="8" rx="4" fill="var(--landing-ink)" opacity="0.5" />
      </g>
      <circle cx="270" cy="130" r="5" fill="var(--landing-gold)" opacity="0.6" />
      <circle cx="282" cy="118" r="3" fill="var(--landing-gold)" opacity="0.4" />
    </svg>
  );
}

function SareeArt() {
  return (
    <svg viewBox="0 0 400 300" className="size-full" role="img" aria-label="A draped saree hanging with a pressing iron">
      <rect width="400" height="300" fill="var(--landing-gold)" opacity="0.1" />
      <line x1="120" y1="54" x2="280" y2="54" stroke="var(--landing-gold)" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M140 54 Q120 140 132 240 L168 240 Q160 150 176 54 Z"
        fill="var(--landing-gold)"
        stroke="var(--landing-ink)"
        strokeWidth="3.5"
      />
      <path
        d="M176 54 Q188 150 210 240 L246 240 Q214 150 216 54 Z"
        fill="var(--landing-gold)"
        stroke="var(--landing-ink)"
        strokeWidth="3.5"
      />
      <path
        d="M216 54 Q248 140 268 240 L260 240 Q236 150 216 60 Z"
        fill="var(--landing-gold)"
        opacity="0.4"
      />
      <line x1="140" y1="70" x2="270" y2="70" stroke="var(--landing-ink)" strokeWidth="3" opacity="0.6" />
      <g transform="translate(80,190) rotate(-14)">
        <path d="M0 20 Q0 0 24 0 L60 0 Q70 0 70 12 Q70 24 56 24 L14 24 Q0 24 0 20 Z" fill="var(--landing-gold)" />
        <rect x="60" y="8" width="18" height="8" rx="4" fill="var(--landing-gold)" />
      </g>
    </svg>
  );
}

function ExpressArt() {
  return (
    <svg viewBox="0 0 400 300" className="size-full" role="img" aria-label="A stopwatch with a lightning bolt for same-day delivery">
      <rect width="400" height="300" fill="var(--landing-gold)" opacity="0.1" />
      <circle cx="200" cy="166" r="78" fill="var(--landing-gold)" stroke="var(--landing-ink)" strokeWidth="4" />
      <circle cx="200" cy="166" r="60" fill="none" stroke="var(--landing-ink)" strokeWidth="3" opacity="0.5" />
      <rect x="184" y="66" width="32" height="16" rx="4" fill="var(--landing-ink)" />
      <line x1="230" y1="60" x2="244" y2="46" stroke="var(--landing-ink)" strokeWidth="5" strokeLinecap="round" />
      <path
        d="M212 118 L176 176 L198 176 L188 218 L228 158 L204 158 Z"
        fill="var(--landing-ink)"
        stroke="var(--landing-ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="90" cy="90" r="4" fill="var(--landing-gold)" opacity="0.6" />
      <circle cx="320" cy="120" r="6" fill="var(--landing-gold)" opacity="0.5" />
      <circle cx="300" cy="230" r="4" fill="var(--landing-gold)" opacity="0.6" />
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

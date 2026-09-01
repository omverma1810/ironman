/**
 * Custom IronMan glyphs for domain concepts Lucide has no honest icon for
 * (docs/05 §2.4). Same grid (24x24), same stroke weight (1.75) and cap
 * style as Lucide, currentColor only — never a hardcoded hex, so one icon
 * works on light, dark, yellow and inverse surfaces alike.
 */
import type { SVGProps } from "react";

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 18h13a3 3 0 0 0 3-3v-2.5a4.5 4.5 0 0 0-4.5-4.5H9.7L6 4.5" />
      <path d="M4 18v1.5A1.5 1.5 0 0 0 5.5 21h1a1.5 1.5 0 0 0 1.5-1.5V18" />
      <path d="M14 18v1.5a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5V18" />
      <circle cx="16.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function HangerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4a1.5 1.5 0 1 1 1.5 1.5" />
      <path d="M12 5.5v2" />
      <path d="M12 7.5 3.5 14a2 2 0 0 0 1.2 3.6h14.6a2 2 0 0 0 1.2-3.6L12 7.5Z" />
      <path d="M6 15h12" />
    </svg>
  );
}

export function GarmentBagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2v3" />
      <path d="M9 5h6l1 2H8l1-2Z" />
      <path d="M7 7h10l1.2 12.1a2 2 0 0 1-2 2.2H7.8a2 2 0 0 1-2-2.2L7 7Z" />
      <path d="M9.5 11c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5" />
    </svg>
  );
}

export function ShirtIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M8 4 4 7l2 3 2-1.3V20h8V8.7L18 10l2-3-4-3-2 2h-4L8 4Z" />
    </svg>
  );
}

export function TrouserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3h12l1 6-2 12h-3l-1.5-9L11 21H8L6 9 6 3Z" />
      <path d="M6.5 8h11" />
    </svg>
  );
}

export function WatchmanIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2 4 5v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V5l-8-3Z" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M8.5 16.5c0-1.9 1.6-3.5 3.5-3.5s3.5 1.6 3.5 3.5" />
    </svg>
  );
}

export function ApartmentTowerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 21V6l6-3 6 3v15" />
      <path d="M6 21h12" />
      <path d="M9 9h.01M12 9h.01M15 9h.01M9 12h.01M12 12h.01M15 12h.01M9 15h.01M12 15h.01M15 15h.01" strokeWidth={2.4} />
      <path d="M10 21v-3h4v3" />
    </svg>
  );
}

export function ScanTagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8V5a1 1 0 0 1 1-1h3" />
      <path d="M20 8V5a1 1 0 0 0-1-1h-3" />
      <path d="M4 16v3a1 1 0 0 0 1 1h3" />
      <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
      <path d="M8 12h8" strokeWidth={2.2} />
      <path d="M8 9v6M11 9v6M14 9v6M17 9v6" strokeWidth={1.4} />
    </svg>
  );
}

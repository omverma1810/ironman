/**
 * @ironman/tokens — single source of design tokens for web (CSS vars via
 * globals.css) and, later, React Native (consumed directly as JS values).
 * Values here and in apps/web/app/globals.css must be kept in sync; this
 * file is the one either platform's code should import from.
 */

export const color = {
  brand: {
    yellow: "#F5C518",
    yellowDim: "#D9AE13",
    ink: "#0B0B0C",
  },
  stage: {
    booked: "#6B7280",
    pickup: "#2563EB",
    atHub: "#7C3AED",
    pressing: "#F59E0B",
    ready: "#0D9488",
    out: "#2563EB",
    delivered: "#16A34A",
    failed: "#DC2626",
    hold: "#DC2626",
  },
  status: {
    success: "#16A34A",
    warning: "#F59E0B",
    danger: "#DC2626",
    info: "#2563EB",
    neutral: "#6B7280",
  },
} as const;

export const space = [0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96] as const;

export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

export const type = {
  scale: [12, 14, 16, 18, 20, 24, 30, 36, 48] as const,
  ui: "Inter, ui-sans-serif, system-ui, sans-serif",
  display: "'Inter Tight', Inter, ui-sans-serif, system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};

export const motion = {
  fast: 120,
  base: 180,
  slow: 260,
  easing: "cubic-bezier(.2,.8,.2,1)",
};

export const zIndex = {
  base: 0,
  sticky: 10,
  dropdown: 20,
  overlay: 30,
  modal: 40,
  toast: 50,
};

/** Order lifecycle stage → the badge color + label used everywhere the
 * stage is shown (production board, timeline, job card, tracking page). */
export const stageLabels: Record<keyof typeof color.stage, string> = {
  booked: "Booked",
  pickup: "Pickup",
  atHub: "At Hub",
  pressing: "Pressing",
  ready: "Ready",
  out: "Out for Delivery",
  delivered: "Delivered",
  failed: "Failed",
  hold: "On Hold",
};

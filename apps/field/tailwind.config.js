/** @type {import('tailwindcss').Config} */
// Values mirror packages/tokens/src/index.ts by hand — same "kept in sync
// manually" approach apps/web/app/globals.css already uses for the same
// package (a plain Node `require()` here can't load that file's
// TypeScript without an extra transpile step Tailwind's config loader
// doesn't provide).
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: "#F5C518",
          "yellow-dim": "#D9AE13",
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
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
        pill: "999px",
      },
    },
  },
  plugins: [],
};

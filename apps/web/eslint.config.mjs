import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tailwind from "eslint-plugin-tailwindcss";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ...tailwind.configs.recommended,
    settings: {
      tailwindcss: {
        cssConfigPath: "./app/globals.css",
        // Custom color/spacing utilities generated from our @theme tokens
        // (docs/05 §2.2) — not part of Tailwind's stock palette, so the
        // plugin needs to be told they're intentional, not typos.
        callees: ["cn", "cva", "clsx"],
      },
    },
    rules: {
      ...tailwind.configs.recommended.rules,
      // docs/05 §2.5: "arbitrary values are lint errors" — consistency
      // that depends on discipline does not survive a deadline. Every
      // color/spacing/radius/shadow value must come from a token.
      "tailwindcss/no-arbitrary-value": "warn",
      "tailwindcss/no-custom-classname": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;

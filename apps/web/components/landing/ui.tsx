import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export type Ground = "dark" | "light" | "accent";

/** One band of the page. The ground sets the section's colours (see the
 * .landing-* rules in globals.css), so everything inside uses the semantic
 * classes (text-landing-fg, bg-landing-card, ...) and works on all three. */
export function Section({
  ground,
  id,
  className = "",
  children,
  ...rest
}: {
  ground: Ground;
  id?: string;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<"section">, "className" | "children">) {
  return (
    <section
      id={id}
      className={`landing-${ground} relative bg-landing-paper text-landing-fg ${className}`}
      {...rest}
    >
      {children}
    </section>
  );
}

/** The small label above a heading: a yellow pill with ink text, readable on
 * every ground (plain yellow text isn't, on white). */
export function Eyebrow({ children, onAccent = false }: { children: ReactNode; onAccent?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 font-landing-label text-xs font-bold tracking-widest uppercase ${
        // A yellow pill would vanish on the yellow ground: flip it to black.
        onAccent ? "bg-landing-ink text-landing-gold" : "bg-landing-gold text-landing-ink"
      }`}
    >
      {children}
    </span>
  );
}

/** A section's big line. Set heavy and tight, as the wordmark is drawn. */
export function Heading({
  children,
  className = "",
  as: Tag = "h2",
}: {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Tag
      className={`leading-1.05 font-landing-heading text-4xl font-extrabold tracking-tight text-balance text-landing-fg sm:text-5xl lg:text-6xl ${className}`}
    >
      {children}
    </Tag>
  );
}

type ButtonProps = {
  href: string;
  variant?: "primary" | "dark" | "outline";
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<"a">, "href" | "className" | "children">;

const BUTTON =
  "duration-fast inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 font-(family-name:--font-landing-label) text-sm font-bold transition hover:scale-103 focus-visible:outline-2 focus-visible:outline-offset-4";

const VARIANT = {
  // Yellow with ink text: the main call to action on dark and light grounds.
  primary: "bg-landing-gold text-landing-ink hover:bg-landing-gold-deep focus-visible:outline-landing-gold",
  // Black with white text: the same call to action on the yellow ground.
  dark: "bg-landing-ink text-white hover:bg-black focus-visible:outline-landing-ink",
  // A quiet second action, drawn in the section's own text colour.
  outline: "border-2 border-landing-fg text-landing-fg hover:bg-landing-fg hover:text-landing-paper focus-visible:outline-landing-fg",
};

export function LandingButton({ href, variant = "primary", children, className = "", ...rest }: ButtonProps) {
  const classes = `${BUTTON} ${VARIANT[variant]} ${className}`;
  return href.startsWith("#") || href.startsWith("http") || href.startsWith("tel:") ? (
    <a href={href} className={classes} {...rest}>
      {children}
    </a>
  ) : (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}

/** The wordmark as the brand draws it: IRON in white, MAN in yellow. On a
 * light ground "IRON" turns to ink (white would vanish); "MAN" stays yellow,
 * as in the logo, which is exempt from text-contrast rules. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-landing-heading font-extrabold tracking-tight uppercase ${className}`}
      aria-label="IRON MAN"
    >
      <span aria-hidden="true" className="text-landing-fg">
        Iron
      </span>{" "}
      <span aria-hidden="true" className="text-landing-gold">
        Man
      </span>
    </span>
  );
}

"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { GARMENTS, GARMENTS_SECTION, type Garment } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";
import { Eyebrow, Heading, Section } from "./ui";

/** Shirts get the tall tile (they are most of what people send); the other
 * four share the right-hand side. Photos run edge to edge in full colour, with
 * the label on a dark fade so it reads on any picture. */
function GarmentTile({ garment, featured }: { garment: Garment; featured: boolean }) {
  return (
    <motion.li
      variants={fadeUp}
      className={`group relative min-h-72 overflow-hidden rounded-3xl bg-landing-ink ${
        featured ? "min-h-96 md:row-span-2" : ""
      }`}
    >
      <Image
        src={garment.photo}
        alt={garment.alt}
        fill
        sizes={featured ? "(min-width: 768px) 34vw, 100vw" : "(min-width: 768px) 33vw, 100vw"}
        className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-linear-to-t from-black/85 via-black/55 to-transparent p-6 pt-20">
        <h3 className="font-landing-heading text-2xl font-extrabold tracking-tight text-white">
          {garment.title}
        </h3>
        <p className="text-sm text-white/80">{garment.line}</p>
      </div>
    </motion.li>
  );
}

export function Garments() {
  return (
    <Section ground="dark" id="garments" className="px-6 py-24 lg:py-36">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
        <Eyebrow>{GARMENTS_SECTION.eyebrow}</Eyebrow>
        <Heading>
          From everyday shirts to <span className="hl">wedding kurtas.</span>
        </Heading>
        <p className="text-lg text-landing-muted">{GARMENTS_SECTION.body}</p>
      </div>

      <motion.ul
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.1 }}
        className="mx-auto mt-16 grid max-w-7xl grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-2"
      >
        {GARMENTS.map((garment) => (
          <GarmentTile key={garment.slug} garment={garment} featured={garment.slug === "shirts"} />
        ))}
      </motion.ul>
    </Section>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { SERVICES } from "@/lib/landing/content";
import { SERVICE_ILLUSTRATIONS } from "./ServiceIllustrations";
import { fadeUp, stagger } from "@/lib/landing/animations";
import { Eyebrow, Heading, Section } from "./ui";

export function ServicesGrid() {
  return (
    <Section ground="light" id="services" className="px-6 py-24 lg:py-36">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
        <Eyebrow>Beyond ironing</Eyebrow>
        <Heading>
          Everything else, <span className="hl">on one pickup.</span>
        </Heading>
        <p className="text-lg text-landing-muted">
          Laundry, dry cleaning, sarees, sneakers and more. Hand it all over in one go and we
          will sort it out.
        </p>
      </div>

      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
        className="mx-auto mt-16 grid max-w-7xl grid-cols-1 gap-x-6 gap-y-16 md:grid-cols-2 lg:grid-cols-3"
      >
        {SERVICES.map((service) => {
          const Illustration = SERVICE_ILLUSTRATIONS[service.slug];
          return (
            <motion.div key={service.slug} variants={fadeUp}>
              <motion.div
                whileHover={{ y: -8 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className="group"
              >
                <div className="relative aspect-5/4 overflow-hidden rounded-t-2xl bg-landing-line">
                  <motion.div
                    className="size-full"
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {service.photo ? (
                      <Image
                        src={service.photo}
                        alt={service.title}
                        fill
                        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                        className="object-cover"
                      />
                    ) : (
                      <Illustration />
                    )}
                  </motion.div>
                </div>
                <div className="relative z-10 mx-5 -mt-5 flex flex-col gap-3 rounded-2xl bg-landing-card p-6 text-left shadow-landing-lift">
                  <h3 className="font-landing-heading text-lg font-bold text-landing-fg">
                    {service.title}
                  </h3>
                  <p className="text-sm text-landing-muted">{service.description}</p>
                  <ul className="flex flex-col gap-1.5 text-sm text-landing-muted">
                    {service.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-landing-fg" aria-hidden="true" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/book"
                    className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-landing-fg"
                  >
                    Book a pickup
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                </div>
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
    </Section>
  );
}

"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { SERVICES } from "@/lib/landing/content";
import { SERVICE_ILLUSTRATIONS } from "./ServiceIllustrations";
import { fadeUp, stagger } from "@/lib/landing/animations";

export function ServicesGrid() {
  return (
    <section id="services" className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <span className="text-sm font-semibold tracking-widest text-landing-gold uppercase">
          Our Services
        </span>
        <h2 className="font-landing-heading text-4xl font-bold text-balance text-landing-ink">
          Every garment, the right kind of care.
        </h2>
        <p className="text-landing-muted">
          Six specialisms, one pickup — our team routes every item to the right process
          automatically.
        </p>
      </div>

      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
        className="mt-16 grid grid-cols-1 gap-x-6 gap-y-16 md:grid-cols-2 lg:grid-cols-3"
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
                <div className="aspect-4/3 overflow-hidden rounded-t-2xl bg-landing-gold/12">
                  <motion.div
                    className="size-full"
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Illustration />
                  </motion.div>
                </div>
                <div className="relative z-10 mx-5 -mt-8 flex flex-col gap-3 rounded-2xl bg-landing-card p-6 text-left shadow-landing-lift">
                  <h3 className="font-landing-heading text-lg font-bold text-landing-ink">
                    {service.title}
                  </h3>
                  <p className="text-sm text-landing-muted">{service.description}</p>
                  <ul className="flex flex-col gap-1.5 text-sm text-landing-muted">
                    {service.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-landing-gold" aria-hidden="true" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/book"
                    className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-landing-gold"
                  >
                    Learn more
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
    </section>
  );
}

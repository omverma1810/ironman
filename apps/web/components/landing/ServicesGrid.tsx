"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Droplets, Footprints, Gem, ScrollText, Shirt, Zap, type LucideIcon } from "lucide-react";
import { SERVICES, type Service } from "@/lib/landing/content";
import { fadeUp, stagger } from "@/lib/landing/animations";

const ICON_BY_SLUG: Record<Service["slug"], LucideIcon> = {
  "dry-cleaning": Shirt,
  "wash-fold": Droplets,
  "designer-garment": Gem,
  "shoe-sneaker": Footprints,
  "saree-drapery": ScrollText,
  express: Zap,
};

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
        viewport={{ once: true, amount: 0.2 }}
        className="mt-16 grid grid-cols-1 gap-x-6 gap-y-14 md:grid-cols-3"
      >
        {SERVICES.map((service) => {
          const Icon = ICON_BY_SLUG[service.slug];
          return (
            <motion.div key={service.slug} variants={fadeUp}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
              >
                <div className="flex aspect-4/3 items-center justify-center rounded-t-2xl bg-landing-gold/12">
                  <Icon className="size-14 text-landing-gold" aria-hidden="true" />
                </div>
                <div className="relative z-10 mx-5 -mt-10 flex flex-col items-center gap-2 rounded-2xl bg-landing-card p-6 text-center shadow-landing-lift">
                  <h3 className="font-landing-heading text-lg font-bold text-landing-ink">
                    {service.title}
                  </h3>
                  <p className="text-sm text-landing-muted">{service.description}</p>
                  <Link
                    href="/book"
                    className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-landing-gold"
                  >
                    Learn more
                    <ArrowRight className="size-4" aria-hidden="true" />
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

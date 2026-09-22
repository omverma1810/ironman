"use client";

import { motion } from "motion/react";
import { MessageCircle, Shirt } from "lucide-react";
import { CONTACT_PHONE, CONTACT_PHONE_TEL } from "@/lib/landing/content";
import { fadeUp } from "@/lib/landing/animations";
import { whatsappBookingHref } from "@/lib/landing/whatsapp";

export function CTABanner() {
  const whatsappHref = whatsappBookingHref(
    "Hi IronMan! I'd like to schedule a laundry pickup."
  );

  return (
    <section id="contact" className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        variants={fadeUp}
        className="relative overflow-hidden rounded-landing-blob bg-landing-gold px-6 py-16 text-center sm:px-12"
      >
        <div
          className="pointer-events-none absolute inset-0 grid grid-cols-6 gap-8 p-8 opacity-10"
          aria-hidden="true"
        >
          {Array.from({ length: 18 }).map((_, i) => (
            <Shirt key={i} className="size-8 text-landing-ink" />
          ))}
        </div>

        <div className="relative flex flex-col items-center gap-4">
          <h2 className="font-landing-heading text-4xl font-bold text-balance text-landing-gold">
            Ready for fresher clothes?
          </h2>
          <p className="max-w-md text-landing-ink/70">
            Book a pickup in under a minute — our team confirms your slot and takes it from there.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="duration-fast flex items-center gap-2 rounded-full bg-landing-ink px-6 py-3 text-sm font-semibold text-white transition-transform hover:scale-103"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                Book on WhatsApp
              </a>
            ) : (
              <a
                href={`tel:${CONTACT_PHONE_TEL}`}
                className="duration-fast flex items-center gap-2 rounded-full bg-landing-ink px-6 py-3 text-sm font-semibold text-white transition-transform hover:scale-103"
              >
                Call {CONTACT_PHONE}
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </section>
  );
}

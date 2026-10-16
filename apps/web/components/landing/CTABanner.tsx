"use client";

import { motion } from "motion/react";
import { MessageCircle } from "lucide-react";
import { WHATSAPP_MESSAGES } from "@/lib/landing/content";
import { fadeUp } from "@/lib/landing/animations";
import { whatsappHref } from "@/lib/landing/whatsapp";
import { Heading, LandingButton, Section } from "./ui";

export function CTABanner() {
  const whatsapp = whatsappHref(WHATSAPP_MESSAGES.book);

  return (
    <Section ground="accent" id="contact" className="overflow-hidden px-6 py-28 lg:py-40">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        variants={fadeUp}
        className="mx-auto flex max-w-4xl flex-col items-center gap-7 text-center"
      >
        <Heading className="text-5xl sm:text-6xl lg:text-8xl">
          Ready for crisp clothes?
        </Heading>
        <p className="max-w-xl text-lg font-medium text-landing-muted sm:text-xl">
          Book a pickup in under a minute. We&rsquo;ll take it from here.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <LandingButton href="/book" variant="dark">
            Book a Pickup
          </LandingButton>
          <LandingButton href={whatsapp} variant="outline" target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-4" aria-hidden="true" />
            Book on WhatsApp
          </LandingButton>
        </div>
      </motion.div>
    </Section>
  );
}

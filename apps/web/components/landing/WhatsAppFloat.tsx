"use client";

import { motion } from "motion/react";
import { MessageCircle } from "lucide-react";
import { whatsappBookingHref } from "@/lib/landing/whatsapp";

/** Hidden entirely while NEXT_PUBLIC_WHATSAPP_NUMBER is unset (same gate
 * as the CTA banner and the batch 4.8 landing CTA) — a floating WhatsApp
 * button that opens nothing is worse than no button at all. */
export function WhatsAppFloat() {
  const href = whatsappBookingHref("Hi IronMan! I'd like to schedule a laundry pickup.");
  if (!href) return null;

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with IronMan on WhatsApp"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20, delay: 1.5 }}
      className="fixed right-6 bottom-6 z-50 flex size-14 items-center justify-center rounded-full shadow-landing-lift"
      style={{ backgroundColor: "#25D366" }}
    >
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: "#25D366" }}
        animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        aria-hidden="true"
      />
      <MessageCircle className="relative size-6 text-white" aria-hidden="true" />
    </motion.a>
  );
}

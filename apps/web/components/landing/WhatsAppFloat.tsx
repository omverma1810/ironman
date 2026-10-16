"use client";

import { motion } from "motion/react";
import { MessageCircle } from "lucide-react";
import { WHATSAPP_MESSAGES } from "@/lib/landing/content";
import { whatsappHref } from "@/lib/landing/whatsapp";

/** Opens a WhatsApp chat with IRON MAN, with a booking message already typed. */
export function WhatsAppFloat() {
  const href = whatsappHref(WHATSAPP_MESSAGES.book);

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with IRON MAN on WhatsApp"
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

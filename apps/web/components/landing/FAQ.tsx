"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { FAQS } from "@/lib/landing/content";

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-20 lg:py-28">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="text-sm font-semibold tracking-widest text-landing-gold uppercase">
          Questions
        </span>
        <h2 className="font-landing-heading text-4xl font-bold text-balance text-landing-ink">
          Frequently asked questions.
        </h2>
      </div>

      <div className="mt-12 flex flex-col">
        {FAQS.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={faq.question} className="border-b border-landing-ink/10">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-5 text-left"
              >
                <span className="font-landing-heading font-semibold text-landing-ink">
                  {faq.question}
                </span>
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0 text-landing-gold"
                >
                  <ChevronDown className="size-5" aria-hidden="true" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <p className="pb-5 text-sm text-landing-muted">{faq.answer}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}

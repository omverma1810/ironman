"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor, type LucideIcon } from "lucide-react";

const OPTIONS: { value: "light" | "dark" | "system"; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Same light/dark/system toggle already used on the console, restyled
 * for the marketing page's own gold-on-card look instead of the
 * console's shadcn dropdown. Gold stays the one constant brand accent
 * across both themes — only the ground and ink flip. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="size-10 shrink-0" aria-hidden="true" />;
  }

  const ActiveIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Change theme"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-10 items-center justify-center rounded-full text-landing-gold transition-colors hover:bg-landing-gold/10"
      >
        <ActiveIcon className="size-4" aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full right-0 z-50 mt-2 flex min-w-36 flex-col gap-0.5 rounded-xl border border-landing-gold/10 bg-landing-card p-1.5 shadow-landing-lift"
            >
              {OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setTheme(option.value);
                      setOpen(false);
                    }}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-landing-gold/15 text-landing-gold"
                        : "text-landing-muted hover:bg-landing-gold/10 hover:text-landing-gold"
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

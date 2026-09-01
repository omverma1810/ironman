import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "border-transparent bg-status-neutral-bg text-status-neutral",
        success: "border-transparent bg-status-success-bg text-status-success",
        warning: "border-transparent bg-status-warning-bg text-status-warning",
        danger: "border-transparent bg-status-danger-bg text-status-danger",
        info: "border-transparent bg-status-info-bg text-status-info",
        outline: "border-border-default bg-transparent text-text-secondary",
        brand: "border-transparent bg-brand-yellow text-text-on-brand",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

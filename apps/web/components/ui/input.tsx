import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, invalid, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        aria-invalid={invalid}
        className={cn(
          "flex h-9 w-full rounded-md border bg-surface-base px-3 py-1 text-sm text-text-primary shadow-xs transition-colors placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-50",
          invalid ? "border-status-danger" : "border-border-default focus-visible:border-border-focus",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry wiring lands in Phase 7 (docs/10 §3.1) — logged for now so
    // errors are at least visible during development.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface-sunken px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-status-danger-bg text-status-danger">
        <Icon name="alert-triangle" className="size-8" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold text-text-primary">Something went wrong</h1>
        <p className="max-w-sm text-sm text-text-secondary">
          We hit a snag loading this page. Try again, or head back to the dashboard.
        </p>
        {error.digest && <p className="text-xs text-text-muted">Ref: {error.digest}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => reset()}>
          <Icon name="refresh" /> Try again
        </Button>
        <Button asChild variant="secondary">
          <Link href="/console">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

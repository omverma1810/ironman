"use client";

import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";

/** docs/05 §5: a human message, a Retry that actually retries, and the
 * request_id shown small so a screenshot is diagnosable — never a raw
 * stack trace, never "Something went wrong" alone. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const isApiError = ApiError.isApiError(error);
  const message = isApiError ? error.message : "Something went wrong loading this.";
  const requestId = isApiError ? error.requestId : undefined;

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-lg border border-status-danger-bg bg-status-danger-bg/40 px-6 py-10 text-center ${className ?? ""}`}
    >
      <Icon name="alert-triangle" className="size-8 text-status-danger" />
      <p className="max-w-sm text-sm text-text-primary">{message}</p>
      <div className="flex items-center gap-2">
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <Icon name="refresh" />
            Retry
          </Button>
        )}
      </div>
      {requestId && <p className="text-xs text-text-muted">Ref: {requestId}</p>}
    </div>
  );
}

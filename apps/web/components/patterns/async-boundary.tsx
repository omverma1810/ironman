"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";
import { ErrorState } from "./error-state";
import { PermissionDenied } from "./permission-denied";

/**
 * The one correct way to render a query result (docs/05 §5). Every data
 * view goes through this — loading, error, permission-denied and success
 * are handled once, here, rather than re-implemented per screen.
 */
export function AsyncBoundary<T>({
  query,
  loading,
  empty,
  isEmpty,
  children,
}: {
  query: UseQueryResult<T>;
  loading: React.ReactNode;
  empty?: React.ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending) {
    return <>{loading}</>;
  }

  if (query.isError) {
    const err = query.error;
    if (ApiError.isApiError(err) && err.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={err} onRetry={() => query.refetch()} />;
  }

  if (empty && isEmpty?.(query.data)) {
    return <>{empty}</>;
  }

  return <>{children(query.data)}</>;
}

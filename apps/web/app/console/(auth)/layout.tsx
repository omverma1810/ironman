"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/errors";
import { ConsoleShell } from "@/components/console/shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConsoleAuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const me = useMe();

  useEffect(() => {
    if (me.isError && ApiError.isApiError(me.error) && [401, 403].includes(me.error.status)) {
      router.replace("/console/login");
    }
  }, [me.isError, me.error, router]);

  if (me.isPending) {
    return (
      <div className="flex h-dvh flex-col gap-4 p-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-4">
          <Skeleton className="hidden h-full sm:block" />
          <Skeleton className="col-span-3 h-full" />
        </div>
      </div>
    );
  }

  if (me.isError || !me.data) {
    return null; // redirect effect will fire
  }

  return <ConsoleShell me={me.data}>{children}</ConsoleShell>;
}

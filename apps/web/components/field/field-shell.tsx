"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLogout, useMe, usePendingSyncCount, useSyncOfflineQueue } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/errors";
import { flushOfflineQueue } from "@/lib/offline/sync";

export function FieldShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();
  const pending = usePendingSyncCount();
  const sync = useSyncOfflineQueue();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      flushOfflineQueue(); // best-effort — usePendingSyncCount's poll picks up the result
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw-field.js", { scope: "/field/" }).catch(() => {
        // installability is a nice-to-have — a failed registration shouldn't block the app
      });
    }
  }, []);

  useEffect(() => {
    if (me.isError && ApiError.isApiError(me.error) && [401, 403].includes(me.error.status)) {
      router.replace("/field/login");
    }
  }, [me.isError, me.error, router]);

  if (me.isPending) {
    return (
      <div className="flex min-h-dvh flex-col gap-3 p-4">
        <Skeleton className="h-14" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (me.isError || !me.data) {
    return null; // redirect effect above will fire
  }

  if (!me.data.roles.includes("FIELD")) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <Icon name="alert-triangle" className="size-10 text-status-warning" />
        <div>
          <h1 className="font-display text-lg font-bold text-text-primary">
            This app is for field staff
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {me.data.full_name} isn&apos;t assigned a field role. Use the ops console instead.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="lg">
            <a href="/console">Go to console</a>
          </Button>
          <Button variant="outline" size="lg" onClick={() => logout.mutate()}>
            Log out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunken">
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-status-warning-bg px-4 py-2 text-xs font-medium text-status-warning">
          <Icon name="offline" className="size-3.5" />
          No signal — your actions are being saved on this phone.
        </div>
      )}
      {online && pending.data ? (
        <button
          type="button"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="flex items-center justify-center gap-2 bg-status-info-bg px-4 py-2 text-xs font-medium text-status-info disabled:opacity-60"
        >
          <Icon name="refresh" className={`size-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
          {sync.isPending
            ? "Syncing…"
            : `${pending.data} action${pending.data === 1 ? "" : "s"} waiting to sync — tap to sync now`}
        </button>
      ) : null}

      <header className="flex items-center justify-between border-b border-border-default bg-surface-raised px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand-yellow text-text-on-brand">
            <Icon name="truck" className="size-4" />
          </div>
          <span className="font-display text-sm font-bold text-text-primary">IronMan Field</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{me.data.full_name}</span>
          <Button variant="ghost" size="icon" onClick={() => logout.mutate()}>
            <Icon name="logout" label="Log out" />
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4 pb-8">{children}</main>
    </div>
  );
}

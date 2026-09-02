"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { Me } from "@/lib/api/types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export function ConsoleShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface-sunken">
      <Topbar me={me} onMenuClick={() => setMobileNavOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-border-default bg-surface-raised lg:block">
          <Sidebar roles={me.roles} />
        </aside>

        <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- viewport-relative cap on the mobile drawer isn't expressible as a spacing token */}
          <DialogContent className="top-0 left-0 h-dvh w-64 max-w-[80vw] translate-0 rounded-none border-y-0 border-r border-l-0 p-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left">
            <VisuallyHidden>
              <DialogTitle>Navigation</DialogTitle>
            </VisuallyHidden>
            <Sidebar roles={me.roles} className="pt-4" />
          </DialogContent>
        </Dialog>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

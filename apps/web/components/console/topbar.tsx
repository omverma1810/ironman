"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./theme-toggle";
import { useLogout } from "@/lib/api/hooks";
import { roleLabel } from "@/lib/permissions";
import type { Me } from "@/lib/api/types";

export function Topbar({ me, onMenuClick }: { me: Me; onMenuClick: () => void }) {
  const logout = useLogout();
  const router = useRouter();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border-default bg-surface-raised px-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <Icon name="menu" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-brand-yellow text-text-on-brand">
            <Icon name="iron" className="size-4" />
          </div>
          <span className="font-display text-sm font-bold tracking-tight text-text-primary">
            IronMan
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Icon name="bell" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Account menu for ${me.full_name || me.email || me.phone}`}
              className="ml-1 flex items-center gap-2 rounded-full focus-visible:outline-2 focus-visible:outline-border-focus"
            >
              <Avatar name={me.full_name || me.email || me.phone || "?"} size="sm" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-1 normal-case">
              <span className="text-sm font-medium text-text-primary">
                {me.full_name || me.email}
              </span>
              <span className="text-xs text-text-muted">{me.email}</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {me.roles.map((r) => (
                  <Badge key={r} variant="outline" className="text-xs">
                    {roleLabel(r)}
                  </Badge>
                ))}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/console/settings")}>
              <Icon name="settings" className="size-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onClick={() => logout.mutate(undefined, { onSuccess: () => router.push("/console/login") })}
            >
              <Icon name="logout" className="size-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

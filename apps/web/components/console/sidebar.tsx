"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconName } from "@/components/icons/icon";
import { Icon } from "@/components/icons/icon";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/api/types";
import { canEditPricing, canManageStaff, canSeeMoney } from "@/lib/permissions";

type NavItem = { href: string; label: string; icon: IconName; show?: (roles: Role[]) => boolean };

const NAV: NavItem[] = [
  { href: "/console", label: "Dashboard", icon: "dashboard" },
  { href: "/console/orders", label: "Orders", icon: "bag" },
  { href: "/console/customers", label: "Customers", icon: "users" },
  { href: "/console/apartments", label: "Apartments", icon: "apartment" },
  { href: "/console/exceptions", label: "Exceptions", icon: "alert-triangle" },
  {
    href: "/console/pricing",
    label: "Pricing",
    icon: "percent",
    show: (roles) => canEditPricing(roles),
  },
  {
    href: "/console/analytics",
    label: "Analytics",
    icon: "chart",
    show: (roles) => canSeeMoney(roles),
  },
  {
    href: "/console/staff",
    label: "Staff",
    icon: "shield",
    show: (roles) => canManageStaff(roles),
  },
];

export function Sidebar({ roles, className }: { roles: Role[]; className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-0.5 p-3", className)} aria-label="Console navigation">
      {NAV.filter((item) => !item.show || item.show(roles)).map((item) => {
        const active =
          item.href === "/console" ? pathname === "/console" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-brand-yellow text-text-on-brand"
                : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={item.icon} className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

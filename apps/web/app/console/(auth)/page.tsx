"use client";

import Link from "next/link";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { StageBadge } from "@/components/patterns/stage-badge";
import { StatTile } from "@/components/patterns/stat-tile";
import { MoneyText } from "@/components/patterns/money-text";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/icons/icon";
import { useMe, useOrders } from "@/lib/api/hooks";
import { formatRelative } from "@/lib/format";
import { canSeeMoney } from "@/lib/permissions";
import type { OrderListItem } from "@/lib/api/types";

const OPEN_STATUSES = new Set([
  "SCHEDULED",
  "PICKUP_ASSIGNED",
  "PICKUP_EN_ROUTE",
  "PICKED_UP",
  "AT_HUB",
  "INTAKE_VERIFIED",
  "IN_PRODUCTION",
  "READY",
  "DELIVERY_ASSIGNED",
  "OUT_FOR_DELIVERY",
  "ON_HOLD",
]);

function computeStats(orders: OrderListItem[]) {
  const today = new Date().toDateString();
  const createdToday = orders.filter((o) => new Date(o.created_at).toDateString() === today);
  const open = orders.filter((o) => OPEN_STATUSES.has(o.status));
  const late = orders.filter((o) => o.is_late_pickup);
  const deliveredToday = orders.filter(
    (o) => o.status === "DELIVERED" && new Date(o.created_at).toDateString() === today
  );
  const grossToday = createdToday.reduce((sum, o) => sum + o.total_minor, 0);

  return { createdToday, open, late, deliveredToday, grossToday };
}

export default function DashboardPage() {
  const me = useMe();
  const ordersQuery = useOrders({});

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Welcome back${me.data?.full_name ? `, ${me.data.full_name.split(" ")[0]}` : ""}`}
        description="Here's what's happening at the hub today."
        actions={
          <Link
            href="/console/orders"
            className="text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            View all orders →
          </Link>
        }
      />

      <AsyncBoundary
        query={ordersQuery}
        loading={
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        }
      >
        {(data) => {
          const stats = computeStats(data.results);
          return (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Open orders" value={String(stats.open.length)} icon="bag" />
              <StatTile
                label="Late pickups"
                value={String(stats.late.length)}
                icon="alert-triangle"
                deltaDirection={stats.late.length > 0 ? "down" : "flat"}
                delta={stats.late.length > 0 ? "needs attention" : "on track"}
              />
              <StatTile label="Delivered today" value={String(stats.deliveredToday.length)} icon="truck" />
              {me.data && canSeeMoney(me.data.roles) ? (
                <StatTile
                  label="Booked today"
                  value={new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: "INR",
                    maximumFractionDigits: 0,
                  }).format(stats.grossToday / 100)}
                  icon="wallet"
                />
              ) : (
                <StatTile label="Orders today" value={String(stats.createdToday.length)} icon="calendar" />
              )}
            </div>
          );
        }}
      </AsyncBoundary>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-sm font-semibold text-text-primary">Recent orders</h2>
        <AsyncBoundary
          query={ordersQuery}
          loading={
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          }
          isEmpty={(data) => data.results.length === 0}
          empty={
            <EmptyState
              icon="package-open"
              title="No orders yet today"
              body="New bookings will appear here as they come in."
            />
          }
        >
          {(data) => (
            <div className="overflow-hidden rounded-lg border border-border-default bg-surface-raised">
              {data.results.slice(0, 8).map((order, i) => (
                <Link
                  key={order.id}
                  href={`/console/orders/${order.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-sunken"
                  style={i > 0 ? { borderTop: "1px solid var(--border-subtle)" } : undefined}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken sm:flex">
                      <Icon name="bag" className="size-4 text-text-muted" />
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-text-primary">
                        {order.ref}
                      </span>
                      <span className="truncate text-xs text-text-muted">
                        {order.customer_name} · {formatRelative(order.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StageBadge status={order.status} />
                    <MoneyText minor={order.total_minor} className="text-xs text-text-muted" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </AsyncBoundary>
      </div>
    </div>
  );
}

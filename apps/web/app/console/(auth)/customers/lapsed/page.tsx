"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { ErrorState } from "@/components/patterns/error-state";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDefaultHub, useLapsedCustomers, useMe, useSendReengagement } from "@/lib/api/hooks";
import { formatDate, formatMoneyMinor } from "@/lib/format";
import { canSeeMoney } from "@/lib/permissions";
import type { LapsedCustomer } from "@/lib/api/types";

const WINDOWS = [
  { value: "30", label: "No order in 30+ days" },
  { value: "45", label: "No order in 45+ days" },
  { value: "60", label: "No order in 60+ days" },
  { value: "90", label: "No order in 90+ days" },
];

export default function LapsedCustomersPage() {
  const me = useMe();
  const allowed = canSeeMoney(me.data?.roles);
  const { hubId, hubsQuery } = useDefaultHub();
  const [days, setDays] = useState("30");
  const [oneTimeOnly, setOneTimeOnly] = useState(false);
  const [offer, setOffer] = useState("");
  const query = useLapsedCustomers({ hub: hubId, days: Number(days), oneTimeOnly });
  const send = useSendReengagement();
  const rows = useMemo(() => query.data ?? [], [query.data]);

  if (me.data && !allowed) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Lapsed customers" />
        <EmptyState
          icon="lock"
          title="Admin/Founder-only"
          body="Re-engagement messages go to customers' phones, so sending them is an Admin or Founder decision."
        />
      </div>
    );
  }

  const columns: ColumnDef<LapsedCustomer, unknown>[] = [
    {
      accessorKey: "name",
      header: "Customer",
      cell: ({ row }) => (
        <Link
          href={`/console/customers/${row.original.customer}`}
          className="flex flex-col hover:underline"
        >
          <span className="font-medium text-text-primary">{row.original.name || "—"}</span>
          <span className="text-xs text-text-muted">{row.original.phone}</span>
        </Link>
      ),
    },
    {
      accessorKey: "apartment_name",
      header: "Apartment",
      cell: ({ row }) => (
        <span className="text-text-secondary">{row.original.apartment_name || "—"}</span>
      ),
    },
    {
      accessorKey: "delivered_orders",
      header: "Orders",
      cell: ({ row }) => (
        <span className="text-text-secondary tabular-nums">
          {row.original.delivered_orders} · {formatMoneyMinor(row.original.spent_minor)}
        </span>
      ),
    },
    {
      accessorKey: "days_since",
      header: "Last delivery",
      cell: ({ row }) => (
        <span className="text-text-secondary">
          {formatDate(row.original.last_delivered_at)} ({row.original.days_since} days)
        </span>
      ),
    },
    {
      accessorKey: "last_contacted_at",
      header: "Last messaged",
      cell: ({ row }) => (
        <span className="text-text-secondary">
          {row.original.last_contacted_at ? formatDate(row.original.last_contacted_at) : "Never"}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lapsed customers"
        description="People who've had an order delivered but haven't come back — and a nudge to bring them back."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/console/customers">
              <Icon name="arrow-left" /> All customers
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Who</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger aria-label="Lapsed for">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOWS.map((w) => (
                    <SelectItem key={w.value} value={w.value}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={oneTimeOnly}
                onChange={(e) => setOneTimeOnly(e.target.checked)}
              />
              Only people who ordered once
            </label>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reengage-offer">Offer line (optional)</Label>
              <Input
                id="reengage-offer"
                value={offer}
                maxLength={120}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="Use code FIRST20 for 20% off"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-muted">
              Sent by WhatsApp where approved, otherwise SMS, with a link to book. Nobody is
              messaged twice within 14 days, and opted-out customers are skipped.
            </p>
            <Button
              disabled={rows.length === 0}
              loading={send.isPending}
              onClick={() =>
                send.mutate({
                  hub: hubId,
                  days: Number(days),
                  one_time_only: oneTimeOnly,
                  offer: offer.trim(),
                })
              }
            >
              <Icon name="chat" /> Message {rows.length} customer{rows.length === 1 ? "" : "s"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Without a hub the list query never starts, so its own error can't
          show; surface the hub failure instead. */}
      {hubsQuery.isError ? (
        <ErrorState error={hubsQuery.error} onRetry={() => hubsQuery.refetch()} />
      ) : (
        <AsyncBoundary
          query={query}
          loading={<Skeleton className="h-40" />}
          isEmpty={() => rows.length === 0}
          empty={
            <EmptyState
              icon="users"
              title="Nobody has lapsed"
              body="Everyone who's had an order delivered has ordered again within this window, or has an order in progress."
            />
          }
        >
          {() => (
            <DataTable
              data={rows}
              columns={columns}
              getRowId={(row) => row.customer}
              mobileCard={(r) => (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-text-primary">{r.name || r.phone}</p>
                  <p className="text-xs text-text-secondary">
                    {r.days_since} days since last delivery · {r.delivered_orders} orders ·{" "}
                    {r.last_contacted_at
                      ? `messaged ${formatDate(r.last_contacted_at)}`
                      : "never messaged"}
                  </p>
                </div>
              )}
            />
          )}
        </AsyncBoundary>
      )}
    </div>
  );
}

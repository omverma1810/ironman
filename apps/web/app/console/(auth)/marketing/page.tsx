"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CampaignDialog } from "@/components/marketing/campaign-dialog";
import { SpendDialog } from "@/components/marketing/spend-dialog";
import { SPEND_CATEGORIES } from "@/components/marketing/labels";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Icon } from "@/components/icons/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcquisitionCost,
  useCampaigns,
  useEndCampaign,
  useHubs,
  useMe,
  useRemoveSpend,
  useSpend,
} from "@/lib/api/hooks";
import { addDaysIso, formatDate, formatMoneyMinor, todayIsoIST } from "@/lib/format";
import { canManageMarketing } from "@/lib/permissions";
import type { Campaign, ChannelCost, Spend } from "@/lib/api/types";

const PERIODS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

const money = (minor: number | null) => (minor === null ? "—" : formatMoneyMinor(minor));
const categoryLabel = (value: string) =>
  SPEND_CATEGORIES.find((c) => c.value === value)?.label ?? value;

function AcquisitionCostCard() {
  const hubId = useHubs().data?.results[0]?.id;
  const [days, setDays] = useState("30");
  const today = todayIsoIST();
  const cost = useAcquisitionCost({
    hub: hubId,
    from: addDaysIso(today, -(Number(days) - 1)),
    to: today,
  });
  const rows = cost.data?.channels ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Cost to get a customer</CardTitle>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-40" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {cost.isLoading || !cost.data ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["New customers", String(cost.data.new_customers)],
                ["Per customer, paid channels", money(cost.data.paid_cac_minor)],
                ["Per customer, all channels", money(cost.data.blended_cac_minor)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-border-default px-3 py-2">
                  <p className="text-xs text-text-muted">{label}</p>
                  <p className="text-lg font-semibold text-text-primary tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-text-muted">
                No new customers or spend in this period yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-text-muted">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Channel</th>
                      <th className="py-2 pr-3 text-right font-medium">Spend</th>
                      <th className="py-2 pr-3 text-right font-medium">Commission</th>
                      <th className="py-2 pr-3 text-right font-medium">New customers</th>
                      <th className="py-2 text-right font-medium">Per customer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: ChannelCost) => (
                      <tr key={r.channel} className="border-t border-border-subtle">
                        <td className="py-2 pr-3 text-text-primary">
                          {r.channel_name}
                          {!r.is_paid && (
                            <span className="ml-2 text-xs text-text-muted">free</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {money(r.spend_minor)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {money(r.commission_minor)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.new_customers}</td>
                        <td className="py-2 text-right font-medium tabular-nums">
                          {money(r.cac_minor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-text-muted">
              A customer counts as new on their first delivered order. Commission paid to partners
              on those first orders is part of the cost.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function MarketingPage() {
  const me = useMe();
  const allowed = canManageMarketing(me.data?.roles);
  const campaignsQuery = useCampaigns();
  const spendQuery = useSpend();
  const endCampaign = useEndCampaign();
  const removeSpend = useRemoveSpend();
  const [creating, setCreating] = useState(false);
  const [spendFor, setSpendFor] = useState<Campaign | null>(null);
  const [removing, setRemoving] = useState<Spend | null>(null);
  const [reason, setReason] = useState("");

  if (me.data && !allowed) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Marketing" description="Campaigns, spend and cost per new customer." />
        <EmptyState
          icon="lock"
          title="Founder-only"
          body="Marketing spend and what each new customer costs are the cost side of the business's margins — visible to Founder accounts only."
        />
      </div>
    );
  }

  const campaigns = campaignsQuery.data?.results ?? [];
  const spend = spendQuery.data?.results ?? [];
  const today = todayIsoIST();

  const campaignColumns: ColumnDef<Campaign, unknown>[] = [
    {
      accessorKey: "name",
      header: "Campaign",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.original.name}</span>
          <span className="text-xs text-text-muted">
            {row.original.channel_name} ·{" "}
            {row.original.apartment_name || row.original.cluster_name || "every apartment"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "start_on",
      header: "Running",
      cell: ({ row }) => {
        const c = row.original;
        const ended = !!c.end_on && c.end_on < today;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-text-secondary">
              {formatDate(c.start_on)} – {c.end_on ? formatDate(c.end_on) : "ongoing"}
            </span>
            <span>
              <Badge variant={ended ? "neutral" : "success"} dot>
                {ended ? "Ended" : "Running"}
              </Badge>
            </span>
          </div>
        );
      },
    },
    {
      id: "spend",
      header: "Spend",
      cell: ({ row }) => (
        <span className="tabular-nums">{money(row.original.summary.spend_minor)}</span>
      ),
    },
    {
      id: "customers",
      header: "New customers",
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.summary.new_customers}</span>
      ),
    },
    {
      id: "cpc",
      header: "Per customer",
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {money(row.original.summary.cost_per_customer_minor)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const c = row.original;
        const ended = !!c.end_on && c.end_on < today;
        return (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSpendFor(c)}>
              <Icon name="plus" /> Spend
            </Button>
            {!ended && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => endCampaign.mutate({ id: c.id, endOn: today })}
              >
                End
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const spendColumns: ColumnDef<Spend, unknown>[] = [
    {
      accessorKey: "spent_on",
      header: "Paid on",
      cell: ({ row }) => (
        <span className="text-text-secondary">{formatDate(row.original.spent_on)}</span>
      ),
    },
    {
      accessorKey: "campaign_name",
      header: "Campaign",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-text-primary">{row.original.campaign_name}</span>
          {row.original.note && (
            <span className="text-xs text-text-muted">{row.original.note}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <span className="text-text-secondary">{categoryLabel(row.original.category)}</span>
      ),
    },
    {
      accessorKey: "amount_minor",
      header: "Amount",
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{money(row.original.amount_minor)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setReason("");
              setRemoving(row.original);
            }}
          >
            Remove
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marketing"
        description="Campaigns, what you spent on them, and what each new customer cost."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Icon name="plus" /> New campaign
          </Button>
        }
      />

      <AcquisitionCostCard />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-text-primary">Campaigns</h2>
        <AsyncBoundary
          query={campaignsQuery}
          loading={<Skeleton className="h-28" />}
          isEmpty={() => campaigns.length === 0}
          empty={
            <EmptyState
              icon="sparkles"
              title="No campaigns yet"
              body="Create one for each flyer drop, influencer post or ad — then enter what you paid, so you can see what each new customer cost."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Icon name="plus" /> Create the first campaign
                </Button>
              }
            />
          }
        >
          {() => (
            <DataTable
              data={campaigns}
              columns={campaignColumns}
              getRowId={(row) => row.id}
              mobileCard={(c) => (
                <div className="flex flex-col gap-2">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{c.name}</p>
                    <p className="text-xs text-text-muted">
                      {c.channel_name} · {c.apartment_name || c.cluster_name || "every apartment"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span>
                      {money(c.summary.spend_minor)} · {c.summary.new_customers} new
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setSpendFor(c)}>
                      Spend
                    </Button>
                  </div>
                </div>
              )}
            />
          )}
        </AsyncBoundary>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-text-primary">Spend</h2>
        {removing && (
          <div
            data-testid="remove-spend"
            className="flex flex-col gap-2 rounded-md border border-border-default p-3 sm:flex-row sm:items-center"
          >
            <span className="text-sm text-text-primary">
              Remove {money(removing.amount_minor)} from &ldquo;{removing.campaign_name}&rdquo;?
            </span>
            <Input
              aria-label="Reason for removing"
              className="sm:max-w-xs"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. entered twice"
            />
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setRemoving(null)}>
                Keep
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!reason.trim()}
                loading={removeSpend.isPending}
                onClick={() =>
                  removeSpend.mutate(
                    { id: removing.id, reason: reason.trim() },
                    { onSuccess: () => setRemoving(null) }
                  )
                }
              >
                Remove
              </Button>
            </div>
          </div>
        )}
        <AsyncBoundary
          query={spendQuery}
          loading={<Skeleton className="h-24" />}
          isEmpty={() => spend.length === 0}
          empty={
            <EmptyState
              icon="wallet"
              title="No spend entered yet"
              body="Use “Spend” on a campaign to record what you paid."
            />
          }
        >
          {() => (
            <DataTable
              data={spend}
              columns={spendColumns}
              getRowId={(row) => row.id}
              mobileCard={(s) => (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-text-primary">{s.campaign_name}</p>
                    <p className="text-xs text-text-muted">
                      {formatDate(s.spent_on)} · {categoryLabel(s.category)}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{money(s.amount_minor)}</span>
                </div>
              )}
            />
          )}
        </AsyncBoundary>
      </section>

      <CampaignDialog open={creating} onOpenChange={setCreating} />
      <SpendDialog campaign={spendFor} onOpenChange={(open) => !open && setSpendFor(null)} />
    </div>
  );
}

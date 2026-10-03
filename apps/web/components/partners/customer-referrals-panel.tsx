"use client";

import { useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCustomerReferralRewards,
  useHubs,
  useReferralProgram,
  useUpdateReferralProgram,
} from "@/lib/api/hooks";
import { formatDate, formatMoneyMinor } from "@/lib/format";
import type { CustomerReferralReward } from "@/lib/api/types";

const toRupees = (minor: number) => String(minor / 100);
const toMinor = (text: string) => Math.round(Number(text) * 100);

export function CustomerReferralsPanel({ canManage }: { canManage: boolean }) {
  const hubsQuery = useHubs();
  const hubId = hubsQuery.data?.results[0]?.id;
  const program = useReferralProgram(hubId);
  const update = useUpdateReferralProgram();
  const rewardsQuery = useCustomerReferralRewards();
  const rewards = rewardsQuery.data?.results ?? [];

  const [active, setActive] = useState(true);
  const [referrer, setReferrer] = useState("");
  const [referee, setReferee] = useState("");
  const [minOrder, setMinOrder] = useState("");

  useEffect(() => {
    if (program.data) {
      setActive(program.data.is_active);
      setReferrer(toRupees(program.data.referrer_reward_minor));
      setReferee(toRupees(program.data.referee_reward_minor));
      setMinOrder(toRupees(program.data.min_order_minor));
    }
  }, [program.data]);

  const values = [referrer, referee, minOrder].map(toMinor);
  const valid = values.every((v) => Number.isInteger(v) && v >= 0) && (!active || values[0] > 0);

  const columns: ColumnDef<CustomerReferralReward, unknown>[] = [
    {
      accessorKey: "referrer_name",
      header: "Referred by",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.original.referrer_name}</span>
          <span className="font-mono text-xs text-text-muted">{row.original.code}</span>
        </div>
      ),
    },
    {
      accessorKey: "referee_name",
      header: "Friend",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-text-secondary">{row.original.referee_name}</span>
          <span className="font-mono text-xs text-text-muted">{row.original.order_ref}</span>
        </div>
      ),
    },
    {
      id: "credit",
      header: "Credit given",
      cell: ({ row }) => (
        <span className="text-text-secondary tabular-nums">
          {formatMoneyMinor(row.original.referrer_credit_minor)} +{" "}
          {formatMoneyMinor(row.original.referee_credit_minor)}
        </span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "When",
      cell: ({ row }) => (
        <span className="text-text-secondary">{formatDate(row.original.created_at)}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Refer-a-friend terms</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {program.isLoading || !program.data ? (
            <Skeleton className="h-20" />
          ) : (
            <>
              <p className="text-sm text-text-secondary">
                Every customer gets a code to share from their account. When a friend who booked
                with it has their first order delivered, both get store credit.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ref-referrer">Customer who refers gets (₹)</Label>
                  <Input
                    id="ref-referrer"
                    inputMode="decimal"
                    value={referrer}
                    disabled={!canManage}
                    onChange={(e) => setReferrer(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ref-referee">Friend gets (₹)</Label>
                  <Input
                    id="ref-referee"
                    inputMode="decimal"
                    value={referee}
                    disabled={!canManage}
                    onChange={(e) => setReferee(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ref-min">Friend&apos;s first order at least (₹)</Label>
                  <Input
                    id="ref-min"
                    inputMode="decimal"
                    value={minOrder}
                    disabled={!canManage}
                    onChange={(e) => setMinOrder(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={active}
                    disabled={!canManage}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  Programme is running
                </label>
                {canManage ? (
                  <Button
                    size="sm"
                    disabled={!valid}
                    loading={update.isPending}
                    onClick={() =>
                      update.mutate({
                        hub: hubId,
                        patch: {
                          is_active: active,
                          referrer_reward_minor: values[0],
                          referee_reward_minor: values[1],
                          min_order_minor: values[2],
                        },
                      })
                    }
                  >
                    Save terms
                  </Button>
                ) : (
                  <span className="text-xs text-text-muted">Only a Founder can change these.</span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AsyncBoundary
        query={rewardsQuery}
        loading={<Skeleton className="h-28" />}
        isEmpty={() => rewards.length === 0}
        empty={
          <EmptyState
            icon="users"
            title="No referral rewards yet"
            body="Rewards appear here when a referred friend's first order is delivered."
          />
        }
      >
        {() => (
          <DataTable
            data={rewards}
            columns={columns}
            getRowId={(row) => row.id}
            mobileCard={(r) => (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-text-primary">
                  {r.referrer_name} → {r.referee_name}
                </p>
                <p className="text-xs text-text-secondary">
                  {formatMoneyMinor(r.referrer_credit_minor)} +{" "}
                  {formatMoneyMinor(r.referee_credit_minor)} · {formatDate(r.created_at)}
                </p>
              </div>
            )}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

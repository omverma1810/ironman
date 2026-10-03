"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/icons/icon";
import { useCommissionRules, useUpdateCommissionRule } from "@/lib/api/hooks";
import { formatDate, todayIsoIST } from "@/lib/format";
import type { CommissionRule } from "@/lib/api/types";
import { CommissionRuleDialog } from "./commission-rule-dialog";
import { describeRule, isRuleActive } from "./commission-format";

function RuleStatus({ rule }: { rule: CommissionRule }) {
  if (isRuleActive(rule)) {
    return (
      <Badge variant="success" dot>
        In force
      </Badge>
    );
  }
  return rule.effective_from > todayIsoIST() ? (
    <Badge variant="info" dot>
      Starts {formatDate(rule.effective_from)}
    </Badge>
  ) : (
    <Badge variant="neutral" dot>
      Ended
    </Badge>
  );
}

export function CommissionRulesPanel({ canManage }: { canManage: boolean }) {
  const rulesQuery = useCommissionRules();
  const updateRule = useUpdateCommissionRule();
  const [creating, setCreating] = useState(false);
  const rules = rulesQuery.data?.results ?? [];

  const columns: ColumnDef<CommissionRule, unknown>[] = [
    {
      accessorKey: "name",
      header: "Rule",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="flex items-center gap-2 font-medium text-text-primary">
            {row.original.name}
            {row.original.is_default && <Badge variant="brand">Hub default</Badge>}
          </span>
          <span className="text-xs text-text-muted">{describeRule(row.original)}</span>
        </div>
      ),
    },
    {
      accessorKey: "effective_from",
      header: "Dates",
      cell: ({ row }) => (
        <span className="text-text-secondary">
          {formatDate(row.original.effective_from)} –{" "}
          {row.original.effective_to ? formatDate(row.original.effective_to) : "open-ended"}
        </span>
      ),
    },
    {
      accessorKey: "partner_count",
      header: "Partners",
      cell: ({ row }) => (
        <span className="text-text-secondary tabular-nums">{row.original.partner_count}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <RuleStatus rule={row.original} />,
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "",
            cell: ({ row }: { row: { original: CommissionRule } }) => {
              const rule = row.original;
              const ended = !!rule.effective_to && rule.effective_to < todayIsoIST();
              return (
                <div className="flex items-center justify-end gap-2">
                  {!rule.is_default && !ended && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateRule.mutate({ id: rule.id, patch: { is_default: true } })
                      }
                    >
                      Make default
                    </Button>
                  )}
                  {!ended && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateRule.mutate({
                          id: rule.id,
                          patch: { effective_to: todayIsoIST(), is_default: false },
                        })
                      }
                    >
                      End today
                    </Button>
                  )}
                </div>
              );
            },
          } satisfies ColumnDef<CommissionRule, unknown>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Icon name="plus" /> New rule
          </Button>
        </div>
      )}
      <AsyncBoundary
        query={rulesQuery}
        loading={<Skeleton className="h-28" />}
        isEmpty={() => rules.length === 0}
        empty={
          <EmptyState
            icon="percent"
            title="No commission rules yet"
            body="Without a rule nobody earns commission. Start with the hub default — for example ₹30 on a referred customer's first order."
            action={
              canManage ? (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Icon name="plus" /> Create the first rule
                </Button>
              ) : undefined
            }
          />
        }
      >
        {() => (
          <DataTable
            data={rules}
            columns={columns}
            getRowId={(row) => row.id}
            mobileCard={(rule) => (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-text-primary">{rule.name}</p>
                  <RuleStatus rule={rule} />
                </div>
                <p className="text-xs text-text-secondary">{describeRule(rule)}</p>
                {rule.is_default && (
                  <span>
                    <Badge variant="brand">Hub default</Badge>
                  </span>
                )}
              </div>
            )}
          />
        )}
      </AsyncBoundary>
      <CommissionRuleDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

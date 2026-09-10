"use client";

import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { MoneyText } from "@/components/patterns/money-text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/icons/icon";
import { useOrderCosts } from "@/lib/api/hooks";
import { canSeeMoney } from "@/lib/permissions";
import type { OrderContributionMargin, Role } from "@/lib/api/types";

const COST_ROW_LABEL: Record<string, string> = {
  consumable_minor: "Consumables",
  commission_minor: "Commission",
  labour_minor: "Labour",
  delivery_minor: "Delivery",
  other_minor: "Other",
};

/** docs/07 §2⑧'s per-order contribution-margin waterfall — Admin/Founder
 * only (docs/06 §3.1's bold "unit economics / margin" row), same
 * `canSeeMoney` gate `Sidebar`'s own Analytics link uses. Renders nothing
 * for any other role, same "just isn't part of this page for you" choice
 * `InvoiceSection` makes for its own status gate. */
export function OrderCostSection({
  orderId,
  roles,
}: {
  orderId: string;
  roles: Role[] | undefined;
}) {
  const canView = canSeeMoney(roles);
  const costsQuery = useOrderCosts(canView ? orderId : undefined);

  if (!canView) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon name="chart" className="size-4 text-text-muted" />
          Unit economics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncBoundary query={costsQuery} loading={<Skeleton className="h-32" />}>
          {(margin) => <ContributionWaterfall margin={margin} />}
        </AsyncBoundary>
      </CardContent>
    </Card>
  );
}

function ContributionWaterfall({ margin }: { margin: OrderContributionMargin }) {
  const costRows = (
    ["consumable_minor", "commission_minor", "labour_minor", "delivery_minor", "other_minor"] as const
  )
    .map((key) => ({ key, label: COST_ROW_LABEL[key], minor: margin[key] }))
    .filter((row) => row.minor > 0);

  return (
    <div className="flex flex-col gap-2">
      <Row label="Revenue" minor={margin.revenue_minor} />
      {costRows.length === 0 ? (
        <p className="text-sm text-text-muted">
          No consumable, labour or delivery costs recorded yet for this order.
        </p>
      ) : (
        costRows.map((row) => <Row key={row.key} label={row.label} minor={-row.minor} muted />)
      )}
      <Separator />
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">Contribution margin</span>
        <div className="flex items-center gap-2">
          {margin.contribution_pct !== null && (
            <span className="text-xs text-text-muted">{margin.contribution_pct}%</span>
          )}
          <MoneyText
            minor={margin.contribution_minor}
            className={
              margin.contribution_minor < 0
                ? "font-semibold text-status-danger"
                : "font-semibold text-text-primary"
            }
          />
        </div>
      </div>
      <p className="text-xs text-text-muted">
        Fixed costs (rent, salaries) aren&apos;t included — this is contribution, not net profit.
        Labour is a configurable per-minute estimate, not a precise measurement.
      </p>
    </div>
  );
}

function Row({ label, minor, muted }: { label: string; minor: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? "text-text-secondary" : "text-text-primary"}>{label}</span>
      <MoneyText minor={minor} muted={muted} />
    </div>
  );
}

"use client";

import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { GarmentStageBadge } from "@/components/patterns/garment-stage-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/icons/icon";
import {
  useCreateBag,
  useOrderBags,
  usePrintBagTag,
  useRecordQc,
  useScanBag,
} from "@/lib/api/hooks";
import { formatDateTime } from "@/lib/format";
import type { BagDetail, GarmentLine, GarmentStage } from "@/lib/api/types";

// The common conveyor path (docs/01 §5.3) — QC is handled by the pass/fail
// controls below, never by the generic "advance" button, since a bag can't
// legally move past QC without an actual check being recorded.
const NEXT_STAGE: Partial<Record<GarmentStage, GarmentStage>> = {
  RECEIVED: "SORTED",
  SORTED: "PRESSING",
  PRESSING: "PRESSED",
  PRESSED: "QC",
  PACKED: "DISPATCHED",
  DISPATCHED: "DELIVERED",
};

const ORDER_STATUSES_WITH_CUSTODY = new Set([
  "INTAKE_VERIFIED",
  "IN_PRODUCTION",
  "READY",
  "DELIVERY_ASSIGNED",
  "OUT_FOR_DELIVERY",
  "DELIVERY_FAILED",
  "RETURNED_TO_HUB",
  "DELIVERED",
  "CLOSED",
]);

export function CustodySection({
  orderId,
  orderStatus,
  canManage,
}: {
  orderId: string;
  orderStatus: string;
  canManage: boolean;
}) {
  const bagsQuery = useOrderBags(orderId);
  const createBag = useCreateBag(orderId);

  if (!ORDER_STATUSES_WITH_CUSTODY.has(orderStatus)) {
    return null; // nothing to bag before intake has fixed real quantities
  }

  // Bagging isn't idempotent (custody.services.create_bag_for_order) — a
  // second click would re-bag every order line and double the garment
  // count. Once we know a bag exists, the button goes away rather than
  // relying on the operator not to double-click.
  const hasBags = (bagsQuery.data?.results.length ?? 0) > 0;
  const canBag = canManage && bagsQuery.data !== undefined && !hasBags;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Icon name="garment-bag" className="size-4 text-text-muted" />
          Custody
        </CardTitle>
        {canBag && (
          <Button
            size="sm"
            variant="outline"
            loading={createBag.isPending}
            onClick={() => createBag.mutate(undefined)}
          >
            <Icon name="scan-tag" /> Bag garments
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <AsyncBoundary
          query={bagsQuery}
          loading={<Skeleton className="h-24" />}
          isEmpty={(data) => data.results.length === 0}
          empty={
            <p className="text-sm text-text-muted">
              No bags yet.{" "}
              {canManage ? "Bag the garments once they're ready to track by scan." : ""}
            </p>
          }
        >
          {(data) => (
            <div className="flex flex-col gap-4">
              {data.results.map((bag) => (
                <BagCard key={bag.id} bag={bag} orderId={orderId} canManage={canManage} />
              ))}
            </div>
          )}
        </AsyncBoundary>
      </CardContent>
    </Card>
  );
}

function BagCard({
  bag,
  orderId,
  canManage,
}: {
  bag: BagDetail;
  orderId: string;
  canManage: boolean;
}) {
  const printTag = usePrintBagTag(orderId);
  const scanBag = useScanBag(orderId);
  const nextStage = NEXT_STAGE[bag.current_stage];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-default p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-text-primary">{bag.code}</span>
          <GarmentStageBadge stage={bag.current_stage} />
          <span className="text-xs text-text-muted">{bag.garment_line_count} garments</span>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              loading={printTag.isPending}
              onClick={() => printTag.mutate(bag.id)}
            >
              <Icon name="scan-tag" />
              {bag.printed_at ? "Reprint tag" : "Print tag"}
            </Button>
            {nextStage && (
              <Button
                size="sm"
                loading={scanBag.isPending}
                onClick={() => scanBag.mutate({ code: bag.code, to_stage: nextStage })}
              >
                Advance to {GARMENT_STAGE_LABEL[nextStage]}
              </Button>
            )}
          </div>
        )}
      </div>
      {bag.printed_at && (
        <p className="text-xs text-text-muted">Tag printed {formatDateTime(bag.printed_at)}</p>
      )}
      <Separator />
      <div className="flex flex-col gap-2">
        {bag.garment_lines.map((line) => (
          <GarmentLineRow key={line.id} line={line} orderId={orderId} canManage={canManage} />
        ))}
      </div>
    </div>
  );
}

function GarmentLineRow({
  line,
  orderId,
  canManage,
}: {
  line: GarmentLine;
  orderId: string;
  canManage: boolean;
}) {
  const recordQc = useRecordQc(orderId);
  const atQc = line.stage === "QC";

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2">
        <Icon name="shirt" className="size-4 text-text-muted" />
        <span className="text-text-primary">
          #{line.seq} {line.garment_type_name}
        </span>
        {line.is_rework && (
          <Badge variant="danger" className="text-xs">
            Rework ×{line.rework_count}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {atQc && canManage ? (
          <>
            <Button
              size="sm"
              variant="outline"
              loading={recordQc.isPending}
              onClick={() => recordQc.mutate({ id: line.id, result: "FAIL" })}
            >
              <Icon name="x-circle" className="text-status-danger" /> Fail
            </Button>
            <Button
              size="sm"
              loading={recordQc.isPending}
              onClick={() => recordQc.mutate({ id: line.id, result: "PASS" })}
            >
              <Icon name="check-circle" /> Pass
            </Button>
          </>
        ) : (
          <GarmentStageBadge stage={line.stage} />
        )}
      </div>
    </div>
  );
}

const GARMENT_STAGE_LABEL: Record<GarmentStage, string> = {
  RECEIVED: "received",
  SORTED: "sorted",
  PRESSING: "pressing",
  PRESSED: "pressed",
  QC: "QC",
  REWORK: "rework",
  PACKED: "packed",
  DISPATCHED: "dispatched",
  DELIVERED: "delivered",
  DAMAGED: "damaged",
  LOST: "lost",
  HELD: "held",
  RETURNED_UNPRESSED: "returned unpressed",
};

"use client";

import { useParams } from "next/navigation";
import { Icon, type IconName } from "@/components/icons/icon";
import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorState } from "@/components/patterns/error-state";
import { MoneyText } from "@/components/patterns/money-text";
import { StageBadge, STAGE_META } from "@/components/patterns/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrderTracking } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/api/client";
import type { OrderStage } from "@/lib/api/types";

const STAGE_STEPS: { key: OrderStage; label: string }[] = [
  { key: "booked", label: "Booked" },
  { key: "pickup", label: "Pickup" },
  { key: "atHub", label: "At Hub" },
  { key: "pressing", label: "Pressing" },
  { key: "ready", label: "Ready" },
  { key: "out", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

export default function TrackOrderPage() {
  const params = useParams<{ token: string }>();
  const query = useOrderTracking(params.token);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex items-center gap-2">
        <Icon name="iron" className="size-5 text-brand-yellow" />
        <span className="font-display text-sm font-semibold text-text-primary">IronMan</span>
      </div>

      {query.isPending && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
        </div>
      )}

      {query.isError &&
        (ApiError.isApiError(query.error) && query.error.status === 404 ? (
          <EmptyState
            icon="package-open"
            title="We couldn't find this order"
            body="This tracking link may have expired or been typed incorrectly. Check the link and try again, or reach out to support."
          />
        ) : (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ))}

      {query.data && <TrackingView order={query.data} />}
    </div>
  );
}

function TrackingView({ order }: { order: NonNullable<ReturnType<typeof useOrderTracking>["data"]> }) {
  const isUnhappy = ["PICKUP_FAILED", "DELIVERY_FAILED", "ON_HOLD", "CANCELLED"].includes(
    order.status
  );
  const currentStepIndex = STAGE_STEPS.findIndex((s) => s.key === order.stage);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-xl font-semibold text-text-primary sm:text-2xl">
            {order.ref}
          </h1>
          <p className="text-sm text-text-secondary">
            {order.customer_name} · {order.service_name}
          </p>
        </div>
        <StageBadge status={order.status} className="text-sm" />
      </div>

      {isUnhappy ? (
        <div className="flex items-start gap-3 rounded-lg border border-status-warning-bg bg-status-warning-bg/60 p-4">
          <Icon name="alert-triangle" className="mt-0.5 size-5 shrink-0 text-status-warning" />
          <p className="text-sm text-text-primary">
            {order.status === "CANCELLED"
              ? "This order was cancelled."
              : order.status === "ON_HOLD"
                ? "This order is on hold — we'll reach out if we need anything from you."
                : "We hit a snag on this order — we'll be in touch shortly to sort it out."}
          </p>
        </div>
      ) : (
        <StageProgress currentIndex={currentStepIndex} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {order.lines.map((line) => (
            <div key={line.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Icon name="shirt" className="size-4 text-text-muted" />
                <span className="text-text-primary">{line.garment_type_name}</span>
                <span className="text-text-muted">
                  × {line.verified_qty ?? line.declared_qty}
                  {line.verified_qty == null && " (est.)"}
                </span>
              </div>
              <MoneyText minor={line.line_total_minor} />
            </div>
          ))}
          <Separator />
          <div className="flex items-center justify-between text-sm font-semibold text-text-primary">
            <span>Total</span>
            <MoneyText minor={order.total_minor} />
          </div>
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Payment</span>
            <Badge variant={order.payment_status === "PAID" ? "success" : "warning"}>
              {order.payment_status.replaceAll("_", " ").toLowerCase()}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {order.address && (
            <DetailRow icon="map-pin" label="Address">
              {order.address}
            </DetailRow>
          )}
          {order.pickup_promised_at && (
            <DetailRow icon="clock" label="Pickup">
              {formatDateTime(order.pickup_promised_at)}
            </DetailRow>
          )}
          {order.delivery_promised_at && (
            <DetailRow icon="clock" label="Delivery">
              {formatDateTime(order.delivery_promised_at)}
            </DetailRow>
          )}
          {order.delivered_at && (
            <DetailRow icon="check-circle" label="Delivered">
              {formatDateTime(order.delivered_at)}
            </DetailRow>
          )}
        </CardContent>
      </Card>

      {order.invoice && (
        <Card>
          <CardHeader>
            <CardTitle>Invoice</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-text-primary">{order.invoice.ref}</span>
              {order.invoice.issued_at && (
                <span className="text-xs text-text-muted">
                  Issued {formatDateTime(order.invoice.issued_at)}
                </span>
              )}
            </div>
            {order.invoice.pdf_url && (
              <a
                href={resolveMediaUrl(order.invoice.pdf_url) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-sunken"
              >
                <Icon name="download" /> Download
              </a>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {order.events.length === 0 ? (
            <p className="text-sm text-text-muted">No activity recorded yet.</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {order.events.map((event, i) => (
                <li key={`${event.event_type}-${event.created_at}`} className="relative flex gap-3 pl-1">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-brand-yellow" aria-hidden="true" />
                    {i < order.events.length - 1 && (
                      <span className="w-px flex-1 bg-border-default" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col pb-1">
                    <span className="text-sm text-text-primary">
                      {STAGE_META[event.to_status]?.label ?? event.to_status}
                    </span>
                    <span className="text-xs text-text-muted">{formatDateTime(event.created_at)}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StageProgress({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="flex items-center">
      {STAGE_STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step.key} className="flex flex-1 flex-col items-center gap-1.5 last:flex-none">
            <div className="flex w-full items-center">
              <span
                className={
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium " +
                  (done || active
                    ? "bg-brand-yellow text-brand-ink"
                    : "bg-surface-sunken text-text-muted")
                }
              >
                {done ? <Icon name="check" className="size-3.5" /> : i + 1}
              </span>
              {i < STAGE_STEPS.length - 1 && (
                <span
                  className={"mx-1 h-px flex-1 " + (done ? "bg-brand-yellow" : "bg-border-default")}
                  aria-hidden="true"
                />
              )}
            </div>
            <span
              className={
                "hidden text-center text-[11px] sm:block " +
                (active ? "font-medium text-text-primary" : "text-text-muted")
              }
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon name={icon} className="mt-0.5 size-4 shrink-0 text-text-muted" />
      <div className="flex flex-1 items-center justify-between gap-3">
        <span className="text-text-muted">{label}</span>
        <span className="text-right text-text-primary">{children}</span>
      </div>
    </div>
  );
}

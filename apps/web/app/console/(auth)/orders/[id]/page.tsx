"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { InvoiceSection } from "@/components/billing/invoice-section";
import { CustodySection } from "@/components/custody/custody-section";
import { ReportExceptionDialog } from "@/components/exceptions/report-exception-dialog";
import { IntakeDialog } from "@/components/orders/intake-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { StageBadge } from "@/components/patterns/stage-badge";
import { MoneyText } from "@/components/patterns/money-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/icons/icon";
import {
  useAdvanceOrder,
  useCancelOrder,
  useMe,
  useOrder,
  useOrderEvents,
  useRequotes,
  useRespondToRequote,
} from "@/lib/api/hooks";
import { formatDateTime, formatRelative } from "@/lib/format";
import { canManageOrders } from "@/lib/permissions";
import type { OrderStatus } from "@/lib/api/types";

const NEXT_ACTION: Partial<Record<OrderStatus, { to: OrderStatus; label: string; icon: string }>> = {
  SCHEDULED: { to: "PICKUP_ASSIGNED", label: "Assign for pickup", icon: "truck" },
  PICKUP_ASSIGNED: { to: "PICKUP_EN_ROUTE", label: "Mark en route", icon: "truck" },
  PICKUP_EN_ROUTE: { to: "PICKED_UP", label: "Mark picked up", icon: "check" },
  PICKED_UP: { to: "AT_HUB", label: "Mark arrived at hub", icon: "apartment" },
  INTAKE_VERIFIED: { to: "IN_PRODUCTION", label: "Start pressing", icon: "iron" },
  IN_PRODUCTION: { to: "READY", label: "Mark ready", icon: "check-circle" },
  READY: { to: "DELIVERY_ASSIGNED", label: "Assign for delivery", icon: "truck" },
  DELIVERY_ASSIGNED: { to: "OUT_FOR_DELIVERY", label: "Mark out for delivery", icon: "truck" },
  OUT_FOR_DELIVERY: { to: "DELIVERED", label: "Mark delivered", icon: "check-circle" },
  DELIVERED: { to: "CLOSED", label: "Close order", icon: "check-circle" },
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const orderQuery = useOrder(params.id);
  const eventsQuery = useOrderEvents(params.id);
  const requotesQuery = useRequotes({ order: params.id, decision: "PENDING" });
  const advance = useAdvanceOrder();
  const cancelOrder = useCancelOrder();
  const respondToRequote = useRespondToRequote();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [reportExceptionOpen, setReportExceptionOpen] = useState(false);

  const canManage = me.data && canManageOrders(me.data.roles);

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => router.push("/console/orders")}
      >
        <Icon name="arrow-left" /> Back to orders
      </Button>

      <AsyncBoundary
        query={orderQuery}
        loading={
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-48" />
          </div>
        }
      >
        {(order) => {
          const nextAction = NEXT_ACTION[order.status];
          const pendingRequote = requotesQuery.data?.results?.[0];
          const isTerminal = ["CANCELLED", "CLOSED"].includes(order.status);

          return (
            <>
              <PageHeader
                title={order.ref}
                description={`${order.customer_name} · ${order.apartment_name || "No apartment on file"}`}
                actions={
                  <div className="flex items-center gap-2">
                    <StageBadge status={order.status} className="text-sm" />
                    {canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReportExceptionOpen(true)}
                      >
                        <Icon name="alert-triangle" /> Report an issue
                      </Button>
                    )}
                    {canManage && !isTerminal && (
                      <>
                        {order.status === "AT_HUB" && (
                          <Button size="sm" onClick={() => setIntakeOpen(true)}>
                            <Icon name="check-circle" /> Verify intake
                          </Button>
                        )}
                        {nextAction && (
                          <Button
                            size="sm"
                            loading={advance.isPending}
                            onClick={() =>
                              advance.mutate({ id: order.id, to_status: nextAction.to })
                            }
                          >
                            {nextAction.label}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                }
              />

              {order.status === "ON_HOLD" && pendingRequote && (
                <div className="flex flex-col gap-3 rounded-lg border border-status-warning-bg bg-status-warning-bg/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Icon name="alert-triangle" className="mt-0.5 size-5 shrink-0 text-status-warning" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        Verified count differs from the estimate — {pendingRequote.reason}
                      </p>
                      <p className="text-sm text-text-secondary">
                        <MoneyText minor={pendingRequote.old_total_minor} /> →{" "}
                        <MoneyText minor={pendingRequote.new_total_minor} className="font-medium" />
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={respondToRequote.isPending}
                        onClick={() =>
                          respondToRequote.mutate({ id: pendingRequote.id, approved: false })
                        }
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        loading={respondToRequote.isPending}
                        onClick={() =>
                          respondToRequote.mutate({ id: pendingRequote.id, approved: true })
                        }
                      >
                        Approve new total
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {order.status === "CANCELLED" && order.cancelled_reason && (
                <div className="rounded-lg border border-border-default bg-surface-sunken p-4 text-sm text-text-secondary">
                  <span className="font-medium text-text-primary">Cancelled</span> — {order.cancelled_reason}
                  {order.cancelled_at && ` · ${formatDateTime(order.cancelled_at)}`}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="flex flex-col gap-4 lg:col-span-2">
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
                      <div className="flex items-center justify-between text-sm text-text-secondary">
                        <span>Subtotal</span>
                        <MoneyText minor={order.subtotal_minor} />
                      </div>
                      {order.discount_minor > 0 && (
                        <div className="flex items-center justify-between text-sm text-status-success">
                          <span>
                            Discount
                            {order.offers_applied.length > 0 && ` (${order.offers_applied.join(", ")})`}
                          </span>
                          <span>−<MoneyText minor={order.discount_minor} /></span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm font-semibold text-text-primary">
                        <span>Total</span>
                        <MoneyText minor={order.total_minor} />
                      </div>
                    </CardContent>
                  </Card>

                  <CustodySection
                    orderId={order.id}
                    orderStatus={order.status}
                    canManage={!!canManage}
                  />

                  <InvoiceSection
                    orderId={order.id}
                    orderStatus={order.status}
                    roles={me.data?.roles}
                  />

                  <Card>
                    <CardHeader>
                      <CardTitle>Timeline</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <AsyncBoundary
                        query={eventsQuery}
                        loading={<Skeleton className="h-32" />}
                        isEmpty={(data) => data.length === 0}
                        empty={<p className="text-sm text-text-muted">No activity recorded yet.</p>}
                      >
                        {(events) => (
                          <ol className="flex flex-col gap-4">
                            {events.map((event, i) => (
                              <li key={event.id} className="relative flex gap-3 pl-1">
                                <div className="flex flex-col items-center">
                                  <span
                                    className="mt-1 size-2 shrink-0 rounded-full bg-brand-yellow"
                                    aria-hidden="true"
                                  />
                                  {i < events.length - 1 && (
                                    <span className="w-px flex-1 bg-border-default" aria-hidden="true" />
                                  )}
                                </div>
                                <div className="flex flex-1 flex-col pb-1">
                                  <span className="text-sm text-text-primary">
                                    {event.to_status
                                      ? `Moved to ${event.to_status.replaceAll("_", " ").toLowerCase()}`
                                      : event.event_type.replaceAll(".", " ").replaceAll("_", " ")}
                                  </span>
                                  <span className="text-xs text-text-muted">
                                    {formatDateTime(event.created_at)}
                                    {event.actor_name && ` · ${event.actor_name}`}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                      </AsyncBoundary>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex flex-col gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Order details</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 text-sm">
                      <DetailRow label="Channel">
                        <Badge variant="outline" className="capitalize">
                          {order.channel.toLowerCase()}
                        </Badge>
                      </DetailRow>
                      <DetailRow label="Payment">
                        <Badge variant={order.payment_status === "PAID" ? "success" : "warning"}>
                          {order.payment_status.replaceAll("_", " ").toLowerCase()}
                        </Badge>
                      </DetailRow>
                      <DetailRow label="Booked">{formatRelative(order.created_at)}</DetailRow>
                      {order.pickup_promised_at && (
                        <DetailRow label="Pickup promised">
                          {formatDateTime(order.pickup_promised_at)}
                        </DetailRow>
                      )}
                      {order.picked_up_at && (
                        <DetailRow label="Picked up">{formatDateTime(order.picked_up_at)}</DetailRow>
                      )}
                      {order.delivered_at && (
                        <DetailRow label="Delivered">{formatDateTime(order.delivered_at)}</DetailRow>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Customer</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 text-sm">
                      <DetailRow label="Name">{order.customer_name}</DetailRow>
                      <DetailRow label="Phone">
                        <a href={`tel:${order.customer_phone}`} className="text-text-primary underline-offset-2 hover:underline">
                          {order.customer_phone}
                        </a>
                      </DetailRow>
                    </CardContent>
                  </Card>

                  {order.notes && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Notes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm whitespace-pre-line text-text-secondary">{order.notes}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>

              <IntakeDialog order={order} open={intakeOpen} onOpenChange={setIntakeOpen} />
              <ReportExceptionDialog
                orderId={order.id}
                open={reportExceptionOpen}
                onOpenChange={setReportExceptionOpen}
              />
            </>
          );
        }}
      </AsyncBoundary>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. Tell us why — it helps us spot patterns.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="mt-3 min-h-24 w-full rounded-md border border-border-default bg-surface-base p-3 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-border-focus"
            placeholder="Reason for cancelling…"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button
              variant="danger"
              loading={cancelOrder.isPending}
              disabled={!cancelReason.trim()}
              onClick={() =>
                cancelOrder.mutate(
                  { id: params.id, reason: cancelReason },
                  { onSuccess: () => setCancelOpen(false) }
                )
              }
            >
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary">{children}</span>
    </div>
  );
}

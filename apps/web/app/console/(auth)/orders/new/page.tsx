"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/patterns/page-header";
import { MoneyText } from "@/components/patterns/money-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/icons/icon";
import {
  useCreateCounterOrder,
  useCustomers,
  useGarmentTypes,
  useHubs,
  useQuoteMutation,
  useServices,
} from "@/lib/api/hooks";

type LineState = Record<string, number>; // garment_type id -> qty

export default function NewOrderPage() {
  const router = useRouter();
  const hubsQuery = useHubs();
  const servicesQuery = useServices();
  const customersQuery = useCustomers();
  const createOrder = useCreateCounterOrder();
  const quote = useQuoteMutation();

  const [hubId, setHubId] = useState<string>("");
  const [serviceId, setServiceId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [lines, setLines] = useState<LineState>({});
  const [notes, setNotes] = useState("");

  const garmentTypesQuery = useGarmentTypes(serviceId || undefined);

  useEffect(() => {
    if (!hubId && hubsQuery.data?.results?.[0]) setHubId(hubsQuery.data.results[0].id);
  }, [hubId, hubsQuery.data]);

  useEffect(() => {
    if (!serviceId && servicesQuery.data?.results?.[0]) {
      setServiceId(servicesQuery.data.results[0].id);
    }
  }, [serviceId, servicesQuery.data]);

  const lineEntries = useMemo(
    () => Object.entries(lines).filter(([, qty]) => qty > 0),
    [lines]
  );

  const canQuote = hubId && serviceId && lineEntries.length > 0;

  useEffect(() => {
    if (!canQuote) return;
    const timeout = setTimeout(() => {
      quote.mutate({
        hub: hubId,
        service: serviceId,
        lines: lineEntries.map(([garment_type, qty]) => ({ garment_type, qty })),
      });
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubId, serviceId, JSON.stringify(lineEntries)]);

  const setQty = (garmentTypeId: string, qty: number) => {
    setLines((prev) => ({ ...prev, [garmentTypeId]: Math.max(0, qty) }));
  };

  const canSubmit = hubId && serviceId && customerId && lineEntries.length > 0 && !createOrder.isPending;

  const handleSubmit = () => {
    createOrder.mutate(
      {
        hub: hubId,
        customer: customerId,
        service: serviceId,
        lines: lineEntries.map(([garment_type, qty]) => ({ garment_type, qty })),
        notes,
      },
      { onSuccess: (order) => router.push(`/console/orders/${order.id}`) }
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => router.back()}>
        <Icon name="arrow-left" /> Back
      </Button>

      <PageHeader
        title="New counter order"
        description="For a customer dropping garments off at the store (R-103) — no pickup leg needed."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Customer &amp; hub</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Hub</Label>
                <Select value={hubId} onValueChange={setHubId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a hub" />
                  </SelectTrigger>
                  <SelectContent>
                    {hubsQuery.data?.results.map((hub) => (
                      <SelectItem key={hub.id} value={hub.id}>
                        {hub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customersQuery.data?.results.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name || c.phone} · {c.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Service</Label>
                <Select value={serviceId} onValueChange={setServiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {servicesQuery.data?.results.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Garments</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!serviceId && (
                <p className="text-sm text-text-muted">Pick a service to see priced garment types.</p>
              )}
              {garmentTypesQuery.data?.results.map((gt) => (
                <div key={gt.id} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Icon name="shirt" className="size-4 text-text-muted" />
                    <span className="text-sm text-text-primary">{gt.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => setQty(gt.id, (lines[gt.id] ?? 0) - 1)}
                      aria-label={`Decrease ${gt.name} quantity`}
                    >
                      −
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">{lines[gt.id] ?? 0}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => setQty(gt.id, (lines[gt.id] ?? 0) + 1)}
                      aria-label={`Increase ${gt.name} quantity`}
                    >
                      +
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                className="min-h-20 w-full rounded-md border border-border-default bg-surface-base p-3 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-border-focus"
                placeholder="Anything the store operator should know…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Estimate</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {lineEntries.length === 0 ? (
                <p className="text-sm text-text-muted">Add garments to see a price.</p>
              ) : quote.isPending ? (
                <p className="text-sm text-text-muted">Calculating…</p>
              ) : quote.data ? (
                <>
                  {quote.data.lines.map((line) => (
                    <div key={line.garment_type} className="flex items-center justify-between text-sm">
                      <span className="text-text-secondary">
                        {line.garment_type_name} × {line.qty}
                      </span>
                      <MoneyText minor={line.line_total.amount_minor} />
                    </div>
                  ))}
                  {quote.data.discount.amount_minor > 0 && (
                    <div className="flex items-center justify-between text-sm text-status-success">
                      <span>Discount</span>
                      <span>−<MoneyText minor={quote.data.discount.amount_minor} /></span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex items-center justify-between text-base font-semibold text-text-primary">
                    <span>Total</span>
                    <MoneyText minor={quote.data.total.amount_minor} />
                  </div>
                </>
              ) : null}

              <Button className="mt-2" size="lg" disabled={!canSubmit} loading={createOrder.isPending} onClick={handleSubmit}>
                Create order
              </Button>
              <p className="text-center text-xs text-text-muted">
                The customer&apos;s items are recorded as estimates until intake confirms the count.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

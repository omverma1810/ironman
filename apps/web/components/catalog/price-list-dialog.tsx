"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { MoneyText } from "@/components/patterns/money-text";
import {
  useActivatePriceList,
  useCreatePriceList,
  useGarmentTypes,
  useHubs,
  useServices,
  useSetPriceLines,
} from "@/lib/api/hooks";
import type { PriceList } from "@/lib/api/types";

/** A price list is created (hub + service) and then edited (per-garment
 * unit prices) as two separate steps against two separate endpoints
 * (`POST /catalog/price-lists/` then `PUT .../lines/`) — this dialog walks
 * both in one flow so a founder doesn't have to reopen it. Once a price
 * list leaves DRAFT (ADR-005: immutable once ACTIVE/SUPERSEDED), the line
 * editor becomes read-only rather than pretending edits would stick. */
export function PriceListDialog({
  priceList,
  open,
  onOpenChange,
}: {
  /** "new" = create a draft; a `PriceList` = view/edit that one. */
  priceList: PriceList | "new" | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isNew = priceList === "new";
  const existing = isNew ? null : priceList;

  const hubsQuery = useHubs();
  const servicesQuery = useServices();
  const hubs = hubsQuery.data?.results ?? [];
  const services = servicesQuery.data?.results ?? [];
  const firstHubId = hubs[0]?.id;
  const firstServiceId = services[0]?.id;

  const [hub, setHub] = useState(existing?.hub ?? "");
  const [service, setService] = useState(existing?.service ?? "");
  // The draft just created in this dialog session, so the line editor can
  // render immediately without the caller re-opening the dialog on a
  // different `priceList` prop.
  const [draft, setDraft] = useState<PriceList | null>(null);

  const activePriceList = draft ?? existing;
  const isDraftStatus = activePriceList?.status === "DRAFT";

  const garmentTypesQuery = useGarmentTypes(service || undefined);
  const garmentTypes = garmentTypesQuery.data?.results ?? [];

  const [prices, setPrices] = useState<Record<string, string>>({});

  const createPriceList = useCreatePriceList();
  const setPriceLines = useSetPriceLines();
  const activatePriceList = useActivatePriceList();

  useEffect(() => {
    if (!open) return;
    // `firstHubId`/`firstServiceId` start undefined until their queries
    // resolve — keying on them (not the whole `hubs`/`services` arrays,
    // new references every render) makes this effect re-run once they
    // load, instead of permanently defaulting to "" from a render that
    // raced ahead of the fetch.
    setHub(existing?.hub ?? firstHubId ?? "");
    setService(existing?.service ?? firstServiceId ?? "");
    setDraft(null);
    const initial: Record<string, string> = {};
    for (const line of existing?.lines ?? []) {
      initial[line.garment_type] = String(line.unit_price_minor / 100);
    }
    setPrices(initial);
  }, [open, existing, firstHubId, firstServiceId]);

  function handleCreateDraft() {
    createPriceList.mutate(
      { hub, service },
      { onSuccess: (created) => setDraft(created) }
    );
  }

  function handleSaveLines() {
    if (!activePriceList) return;
    const lines = garmentTypes
      .map((gt) => ({ garment_type: gt.id, price: prices[gt.id] }))
      .filter((l) => l.price && Number(l.price) > 0)
      .map((l) => ({ garment_type: l.garment_type, unit_price_minor: Math.round(Number(l.price) * 100) }));
    setPriceLines.mutate(
      { id: activePriceList.id, input: { lines } },
      { onSuccess: (updated) => setDraft(updated) }
    );
  }

  function handleActivate() {
    if (!activePriceList) return;
    activatePriceList.mutate(
      { id: activePriceList.id },
      {
        onSuccess: (updated) => {
          setDraft(updated);
          onOpenChange(false);
        },
      }
    );
  }

  const saving = createPriceList.isPending || setPriceLines.isPending || activatePriceList.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{activePriceList ? "Price list" : "New price list"}</DialogTitle>
        </DialogHeader>

        {!activePriceList ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pl-hub">Hub</Label>
              <Select value={hub} onValueChange={setHub}>
                <SelectTrigger id="pl-hub">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hubs.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pl-service">Service</Label>
              <Select value={service} onValueChange={setService}>
                <SelectTrigger id="pl-service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">
                {services.find((s) => s.id === activePriceList.service)?.name ?? activePriceList.service_name}{" "}
                · {hubs.find((h) => h.id === activePriceList.hub)?.name}
              </span>
              <Badge variant={activePriceList.status === "ACTIVE" ? "success" : "neutral"}>
                {activePriceList.status.toLowerCase()} · v{activePriceList.version}
              </Badge>
            </div>
            <Separator />
            {garmentTypes.length === 0 ? (
              <p className="text-sm text-text-muted">No garment types for this service yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {garmentTypes.map((gt) => {
                  const existingLine = activePriceList.lines.find((l) => l.garment_type === gt.id);
                  return (
                    <div key={gt.id} className="flex items-center justify-between gap-3">
                      <Label htmlFor={`price-${gt.id}`} className="flex-1 font-normal">
                        {gt.name}
                      </Label>
                      {isDraftStatus ? (
                        <Input
                          id={`price-${gt.id}`}
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-28"
                          placeholder="₹"
                          value={prices[gt.id] ?? ""}
                          onChange={(e) => setPrices((p) => ({ ...p, [gt.id]: e.target.value }))}
                        />
                      ) : existingLine ? (
                        <MoneyText minor={existingLine.unit_price_minor} />
                      ) : (
                        <span className="text-sm text-text-muted">Not priced</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!activePriceList && (
            <Button loading={createPriceList.isPending} disabled={!hub || !service} onClick={handleCreateDraft}>
              Create draft
            </Button>
          )}
          {isDraftStatus && (
            <>
              <Button
                variant="outline"
                loading={setPriceLines.isPending}
                disabled={saving}
                onClick={handleSaveLines}
              >
                Save prices
              </Button>
              <Button
                loading={activatePriceList.isPending}
                disabled={saving || activePriceList.lines.length === 0}
                onClick={handleActivate}
              >
                Activate
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

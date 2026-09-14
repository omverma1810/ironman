"use client";

import { useEffect, useState } from "react";
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
import { useApartments, useCreateOffer, useUpdateOffer } from "@/lib/api/hooks";
import type { Offer, OfferKind } from "@/lib/api/types";

const KIND_LABEL: Record<OfferKind, string> = {
  FIRST_ORDER: "First-order discount",
  REFERRAL_CREDIT: "Referral credit",
  APARTMENT_PROMO: "Apartment promotion",
  FLAT: "Flat discount",
  PERCENT: "Percent discount",
};

// REFERRAL_CREDIT is excluded here — it's issued to a customer's credit
// ledger by growth attribution (Phase 5), never subtracted from an order
// total at quote time, so it isn't one of the "discount kinds" this
// console screen configures (`catalog.services.quote`'s own docstring).
const CONFIGURABLE_KINDS: OfferKind[] = ["FIRST_ORDER", "APARTMENT_PROMO", "FLAT", "PERCENT"];

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function OfferDialog({
  offer,
  open,
  onOpenChange,
}: {
  /** null = create a new offer */
  offer: Offer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!offer;
  const apartmentsQuery = useApartments();
  const apartments = apartmentsQuery.data?.results ?? [];

  const [code, setCode] = useState(offer?.code ?? "");
  const [kind, setKind] = useState<OfferKind>(offer?.kind ?? "PERCENT");
  const [valueBps, setValueBps] = useState(offer ? String(offer.value_bps / 100) : "");
  const [valueRupees, setValueRupees] = useState(offer ? String(offer.value_minor / 100) : "");
  const [capRupees, setCapRupees] = useState(offer?.cap_minor ? String(offer.cap_minor / 100) : "");
  const [apartment, setApartment] = useState(offer?.apartment ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(toDateInputValue(offer?.effective_from));
  const [effectiveTo, setEffectiveTo] = useState(toDateInputValue(offer?.effective_to));
  const [maxRedemptions, setMaxRedemptions] = useState(
    offer?.max_redemptions ? String(offer.max_redemptions) : ""
  );

  const createOffer = useCreateOffer();
  const updateOffer = useUpdateOffer();
  const saving = createOffer.isPending || updateOffer.isPending;

  useEffect(() => {
    if (!open) return;
    setCode(offer?.code ?? "");
    setKind(offer?.kind ?? "PERCENT");
    setValueBps(offer ? String(offer.value_bps / 100) : "");
    setValueRupees(offer ? String(offer.value_minor / 100) : "");
    setCapRupees(offer?.cap_minor ? String(offer.cap_minor / 100) : "");
    setApartment(offer?.apartment ?? "");
    setEffectiveFrom(toDateInputValue(offer?.effective_from) || new Date().toISOString().slice(0, 10));
    setEffectiveTo(toDateInputValue(offer?.effective_to));
    setMaxRedemptions(offer?.max_redemptions ? String(offer.max_redemptions) : "");
  }, [open, offer]);

  const isPercent = kind === "PERCENT";
  const valid = code.trim().length > 0 && effectiveFrom.length > 0 && (isPercent ? Number(valueBps) > 0 : Number(valueRupees) > 0);

  function handleSave() {
    const input = {
      code: code.trim().toUpperCase(),
      kind,
      value_bps: isPercent ? Math.round(Number(valueBps) * 100) : 0,
      value_minor: isPercent ? 0 : Math.round(Number(valueRupees) * 100),
      cap_minor: capRupees ? Math.round(Number(capRupees) * 100) : null,
      apartment: kind === "APARTMENT_PROMO" && apartment ? apartment : null,
      effective_from: new Date(effectiveFrom).toISOString(),
      effective_to: effectiveTo ? new Date(effectiveTo).toISOString() : null,
      max_redemptions: maxRedemptions ? Number(maxRedemptions) : null,
    };
    if (offer) {
      updateOffer.mutate({ id: offer.id, patch: input }, { onSuccess: () => onOpenChange(false) });
    } else {
      createOffer.mutate(input, { onSuccess: () => onOpenChange(false) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit offer" : "New offer"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="offer-code">Code</Label>
              <Input
                id="offer-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="WELCOME10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="offer-kind">Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as OfferKind)}>
                <SelectTrigger id="offer-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFIGURABLE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isPercent ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="offer-percent">Discount (%)</Label>
              <Input
                id="offer-percent"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={valueBps}
                onChange={(e) => setValueBps(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="offer-value">Discount amount (₹)</Label>
              <Input
                id="offer-value"
                type="number"
                min={0}
                step="0.01"
                value={valueRupees}
                onChange={(e) => setValueRupees(e.target.value)}
              />
            </div>
          )}

          {isPercent && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="offer-cap">Cap (₹, optional)</Label>
              <Input
                id="offer-cap"
                type="number"
                min={0}
                step="0.01"
                value={capRupees}
                onChange={(e) => setCapRupees(e.target.value)}
              />
            </div>
          )}

          {kind === "APARTMENT_PROMO" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="offer-apartment">Apartment</Label>
              <Select value={apartment} onValueChange={setApartment}>
                <SelectTrigger id="offer-apartment">
                  <SelectValue placeholder="Select an apartment" />
                </SelectTrigger>
                <SelectContent>
                  {apartments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="offer-from">Effective from</Label>
              <Input
                id="offer-from"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="offer-to">Effective to (optional)</Label>
              <Input
                id="offer-to"
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="offer-max">Max redemptions (optional)</Label>
            <Input
              id="offer-max"
              type="number"
              min={1}
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!valid} onClick={handleSave}>
            {isEdit ? "Save changes" : "Create offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

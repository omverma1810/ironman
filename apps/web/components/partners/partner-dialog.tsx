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
import { useApartments, useCreatePartner, useHubs, useUpdatePartner } from "@/lib/api/hooks";
import type { PartnerKind, ReferralPartner } from "@/lib/api/types";

const KIND_LABEL: Record<PartnerKind, string> = {
  WATCHMAN: "Watchman",
  INFLUENCER: "Influencer",
  OTHER: "Other",
};

const NO_APARTMENT = "none";

export function PartnerDialog({
  partner,
  open,
  onOpenChange,
}: {
  /** null = onboard a new partner */
  partner: ReferralPartner | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!partner;
  const hubsQuery = useHubs();
  const hubs = hubsQuery.data?.results ?? [];
  const apartmentsQuery = useApartments();
  const apartments = apartmentsQuery.data?.results ?? [];

  const [kind, setKind] = useState<PartnerKind>(partner?.kind ?? "WATCHMAN");
  const [name, setName] = useState(partner?.name ?? "");
  const [phone, setPhone] = useState(partner?.phone ?? "");
  const [apartment, setApartment] = useState(partner?.apartment ?? NO_APARTMENT);
  const [upiId, setUpiId] = useState(partner?.upi_id ?? "");
  const [notes, setNotes] = useState(partner?.notes ?? "");

  const createPartner = useCreatePartner();
  const updatePartner = useUpdatePartner();
  const saving = createPartner.isPending || updatePartner.isPending;

  useEffect(() => {
    if (open) {
      setKind(partner?.kind ?? "WATCHMAN");
      setName(partner?.name ?? "");
      setPhone(partner?.phone ?? "");
      setApartment(partner?.apartment ?? NO_APARTMENT);
      setUpiId(partner?.upi_id ?? "");
      setNotes(partner?.notes ?? "");
    }
  }, [open, partner]);

  function handleSave() {
    const patch = {
      kind,
      name: name.trim(),
      phone: phone.trim(),
      apartment: apartment === NO_APARTMENT ? null : apartment,
      upi_id: upiId.trim(),
      notes: notes.trim(),
    };
    if (isEdit) {
      updatePartner.mutate({ id: partner.id, patch }, { onSuccess: () => onOpenChange(false) });
    } else {
      createPartner.mutate(
        { hub: hubs[0]?.id ?? "", ...patch },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  }

  const valid = name.trim() && phone.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? partner.name : "Onboard a referral partner"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as PartnerKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="partner-phone">Phone</Label>
              <Input id="partner-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="partner-name">Name</Label>
              <Input id="partner-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Apartment</Label>
              <Select value={apartment} onValueChange={setApartment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_APARTMENT}>None</SelectItem>
                  {apartments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="partner-upi">UPI ID</Label>
              <Input
                id="partner-upi"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="name@bank"
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="partner-notes">Notes</Label>
              <textarea
                id="partner-notes"
                className="min-h-16 w-full rounded-md border border-border-default bg-surface-base p-3 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-border-focus"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!valid} onClick={handleSave}>
            {isEdit ? "Save" : "Onboard partner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

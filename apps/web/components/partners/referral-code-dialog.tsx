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
import { useApartments, useCreateReferralCode, useHubs } from "@/lib/api/hooks";
import type { ReferralPartner } from "@/lib/api/types";

const NO_APARTMENT = "none";

export function ReferralCodeDialog({
  partners,
  defaultPartnerId,
  open,
  onOpenChange,
}: {
  partners: ReferralPartner[];
  /** Preselect a partner, e.g. when issued from that partner's row. */
  defaultPartnerId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const hubsQuery = useHubs();
  const hubs = hubsQuery.data?.results ?? [];
  const apartmentsQuery = useApartments();
  const apartments = apartmentsQuery.data?.results ?? [];

  const [ownerPartner, setOwnerPartner] = useState(defaultPartnerId ?? partners[0]?.id ?? "");
  const [apartment, setApartment] = useState(NO_APARTMENT);
  const [code, setCode] = useState("");

  const createCode = useCreateReferralCode();

  useEffect(() => {
    if (open) {
      setOwnerPartner(defaultPartnerId ?? partners[0]?.id ?? "");
      setApartment(NO_APARTMENT);
      setCode("");
    }
  }, [open, defaultPartnerId, partners]);

  function handleSave() {
    createCode.mutate(
      {
        hub: hubs[0]?.id ?? "",
        owner_partner: ownerPartner,
        apartment: apartment === NO_APARTMENT ? null : apartment,
        code: code.trim() || undefined,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  }

  const valid = !!ownerPartner;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue a referral code</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Partner</Label>
            <Select value={ownerPartner} onValueChange={setOwnerPartner}>
              <SelectTrigger>
                <SelectValue placeholder="Select a partner" />
              </SelectTrigger>
              <SelectContent>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.kind.toLowerCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {partners.length === 0 && (
              <p className="text-xs text-text-muted">
                Onboard a partner first — a code always belongs to one.
              </p>
            )}
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
            <Label htmlFor="referral-code">Code (optional)</Label>
            <Input
              id="referral-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Leave blank to auto-generate"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={createCode.isPending} disabled={!valid} onClick={handleSave}>
            Issue code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

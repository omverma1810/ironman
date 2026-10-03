"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useApartments, useCreateCampaign, useHubs } from "@/lib/api/hooks";
import { todayIsoIST } from "@/lib/format";
import type { GrowthChannelCode } from "@/lib/api/types";
import { CAMPAIGN_CHANNELS } from "./labels";

const ALL_APARTMENTS = "all";

export function CampaignDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const hubs = useHubs().data?.results ?? [];
  const apartments = useApartments().data?.results ?? [];
  const create = useCreateCampaign();

  const [name, setName] = useState("");
  const [channel, setChannel] = useState<GrowthChannelCode>("FLYER");
  const [apartment, setApartment] = useState(ALL_APARTMENTS);
  const [startOn, setStartOn] = useState(todayIsoIST());
  const [objective, setObjective] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setChannel("FLYER");
      setApartment(ALL_APARTMENTS);
      setStartOn(todayIsoIST());
      setObjective("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            A campaign is what you enter marketing spend against — so you can see what each new
            customer cost, by channel and by apartment.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="campaign-name">Name</Label>
            <Input
              id="campaign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Flyers — Sai Krupa Residency"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as GrowthChannelCode)}>
              <SelectTrigger aria-label="Channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMPAIGN_CHANNELS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Targets</Label>
            <Select value={apartment} onValueChange={setApartment}>
              <SelectTrigger aria-label="Targets">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_APARTMENTS}>Every apartment</SelectItem>
                {apartments.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-start">Starts on</Label>
            <Input
              id="campaign-start"
              type="date"
              value={startOn}
              onChange={(e) => setStartOn(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-objective">Goal (optional)</Label>
            <Input
              id="campaign-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="20 first orders"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || hubs.length === 0}
            loading={create.isPending}
            onClick={() =>
              create.mutate(
                {
                  hub: hubs[0].id,
                  name: name.trim(),
                  channel,
                  apartment: apartment === ALL_APARTMENTS ? null : apartment,
                  start_on: startOn,
                  objective: objective.trim(),
                },
                { onSuccess: () => onOpenChange(false) }
              )
            }
          >
            Create campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

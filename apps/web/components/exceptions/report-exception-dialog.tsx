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
import { useCreateException } from "@/lib/api/hooks";
import type { OrderException } from "@/lib/api/types";

const KIND_OPTIONS: { value: OrderException["kind"]; label: string }[] = [
  { value: "DAMAGED", label: "Damaged" },
  { value: "LOST", label: "Lost" },
  { value: "MISSING", label: "Missing" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "REPRESS", label: "Re-press requested" },
  { value: "COMPLAINT", label: "Complaint" },
];

// docs/08 batch 2.9's SLA is a real deadline, not a suggestion — default
// it from severity so ops has to actively choose to give a HIGH issue a
// week, rather than the field just sitting empty.
const SLA_HOURS_BY_SEVERITY: Record<OrderException["severity"], number> = {
  HIGH: 24,
  MEDIUM: 72,
  LOW: 24 * 7,
};

function defaultSlaLocal(severity: OrderException["severity"]): string {
  const due = new Date(Date.now() + SLA_HOURS_BY_SEVERITY[severity] * 3600_000);
  due.setMinutes(due.getMinutes() - due.getTimezoneOffset());
  return due.toISOString().slice(0, 16);
}

export function ReportExceptionDialog({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [kind, setKind] = useState<OrderException["kind"]>("DAMAGED");
  const [severity, setSeverity] = useState<OrderException["severity"]>("MEDIUM");
  const [description, setDescription] = useState("");
  const [slaLocal, setSlaLocal] = useState(defaultSlaLocal("MEDIUM"));
  const [slaTouched, setSlaTouched] = useState(false);
  const create = useCreateException();

  useEffect(() => {
    if (open) {
      setKind("DAMAGED");
      setSeverity("MEDIUM");
      setDescription("");
      setSlaLocal(defaultSlaLocal("MEDIUM"));
      setSlaTouched(false);
    }
  }, [open]);

  function handleSeverityChange(value: OrderException["severity"]) {
    setSeverity(value);
    if (!slaTouched) setSlaLocal(defaultSlaLocal(value));
  }

  function handleSubmit() {
    create.mutate(
      {
        order: orderId,
        kind,
        severity,
        description: description.trim(),
        sla_due_at: slaLocal ? new Date(slaLocal).toISOString() : undefined,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
          <DialogDescription>
            Damage, loss, a wrong item or a complaint — this goes straight to the exceptions queue
            with an SLA, not a note someone has to remember.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as OrderException["kind"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => handleSeverityChange(v as OrderException["severity"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exc-description">What happened</Label>
            <textarea
              id="exc-description"
              className="min-h-20 w-full rounded-md border border-border-default bg-surface-base p-3 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-border-focus"
              placeholder="Be specific — which item, what's wrong, what the customer said…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exc-sla">SLA due</Label>
            <Input
              id="exc-sla"
              type="datetime-local"
              className="w-56"
              value={slaLocal}
              onChange={(e) => {
                setSlaLocal(e.target.value);
                setSlaTouched(true);
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={create.isPending}
            disabled={!description.trim()}
            onClick={handleSubmit}
          >
            Report issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

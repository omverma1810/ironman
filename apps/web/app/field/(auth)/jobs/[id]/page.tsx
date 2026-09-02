"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/icons/icon";
import {
  useArriveJobField,
  useCompleteJobField,
  useCreateProofField,
  useFailJobField,
  useJob,
  useJobProofs,
  useOrder,
  useStartJobField,
} from "@/lib/api/hooks";
import { formatTime } from "@/lib/format";
import type { DeclaredLine, JobStatus } from "@/lib/api/types";

const STATUS_BADGE: Record<JobStatus, { label: string; variant: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  PENDING: { label: "Not started", variant: "neutral" },
  EN_ROUTE: { label: "En route", variant: "info" },
  ARRIVED: { label: "Arrived", variant: "warning" },
  DONE: { label: "Done", variant: "success" },
  FAILED: { label: "Failed", variant: "danger" },
};

const FAIL_REASONS = [
  { code: "CUSTOMER_ABSENT", label: "Customer not available" },
  { code: "CUSTOMER_RESCHEDULED", label: "Customer asked to reschedule" },
  { code: "ACCESS_DENIED", label: "Couldn't access the building/gate" },
  { code: "WRONG_ADDRESS", label: "Address issue" },
  { code: "VEHICLE_ISSUE", label: "Vehicle/route issue" },
  { code: "OTHER", label: "Other" },
];

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export default function FieldJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const jobQuery = useJob(id);
  const orderQuery = useOrder(jobQuery.data?.order);
  const proofsQuery = useJobProofs(id);

  const startJob = useStartJobField();
  const arriveJob = useArriveJobField();
  const [failOpen, setFailOpen] = useState(false);

  if (jobQuery.isPending || orderQuery.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (jobQuery.isError || !jobQuery.data || orderQuery.isError || !orderQuery.data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Icon name="alert-triangle" className="size-8 text-status-danger" />
        <p className="text-sm text-text-secondary">Couldn&apos;t load this job.</p>
        <Button asChild size="sm" variant="secondary">
          <Link href="/field">Back to jobs</Link>
        </Button>
      </div>
    );
  }

  const job = jobQuery.data;
  const order = orderQuery.data;
  const status = STATUS_BADGE[job.status];
  const isTerminal = job.status === "DONE" || job.status === "FAILED";
  // `order.address` (when set) already resolves to full text including the
  // apartment name — only fall back to the bare apartment name alone for
  // orders with no stored Address (e.g. a counter walk-in).
  const address = order.address || order.apartment_name || "";
  const showApartmentLabel = !order.address && !!order.apartment_name;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/field">
            <Icon name="arrow-left" /> Jobs
          </Link>
        </Button>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-4">
        <div className="flex items-center gap-2">
          <Icon name={job.kind === "PICKUP" ? "package-open" : "garment-bag"} className="size-5 text-text-secondary" />
          <h1 className="font-display text-lg font-bold text-text-primary">
            {job.kind === "PICKUP" ? "Pickup" : "Delivery"} — {order.ref}
          </h1>
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          {job.slot_start ? formatTime(job.slot_start) : "No slot"}
          {job.slot_end ? ` – ${formatTime(job.slot_end)}` : ""}
        </p>

        <div className="mt-4 flex flex-col gap-2 border-t border-border-default pt-4">
          <div className="flex items-center gap-2">
            <Icon name="user" className="size-4 text-text-muted" />
            <span className="text-sm text-text-primary">{order.customer_name}</span>
          </div>
          {order.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="flex items-center gap-2">
              <Icon name="phone" className="size-4 text-text-muted" />
              <span className="text-sm text-status-info underline">{order.customer_phone}</span>
            </a>
          )}
          <div className="flex items-start gap-2">
            <Icon name="map-pin" className="mt-0.5 size-4 shrink-0 text-text-muted" />
            <span className="text-sm text-text-primary">
              {showApartmentLabel && <span className="font-medium">{order.apartment_name} — </span>}
              {address || "No address on file"}
            </span>
          </div>
          {order.special_instructions && (
            <p className="rounded-md bg-surface-sunken px-3 py-2 text-sm text-text-secondary">
              {order.special_instructions}
            </p>
          )}
        </div>

        {address && (
          <a
            href={mapsUrl(address)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex h-11 items-center justify-center gap-2 rounded-md border border-border-default text-sm font-medium text-text-primary active:bg-surface-sunken"
          >
            <Icon name="map-pin" className="size-4" /> Open in Maps
          </a>
        )}
      </div>

      {proofsQuery.data && proofsQuery.data.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {proofsQuery.data.map((p) => (
            <Badge key={p.id} variant="outline">
              <Icon name={p.kind === "PHOTO" ? "camera" : p.kind === "SIGNATURE" ? "file-text" : "shield"} className="size-3" />
              {p.kind === "PHOTO" ? "Photo" : p.kind === "SIGNATURE" ? "Signature" : "OTP verified"}
            </Badge>
          ))}
        </div>
      )}

      {job.status === "PENDING" && (
        <Button
          size="lg"
          className="h-14 text-base"
          loading={startJob.isPending}
          onClick={() => startJob.mutate(job.id)}
        >
          <Icon name="truck" /> Start {job.kind === "PICKUP" ? "pickup" : "delivery"}
        </Button>
      )}

      {job.status === "EN_ROUTE" && (
        <Button size="lg" className="h-14 text-base" loading={arriveJob.isPending} onClick={() => arriveJob.mutate(job.id)}>
          <Icon name="map-pin" /> Arrived
        </Button>
      )}

      {job.status === "ARRIVED" && (
        <CompletionPanel jobId={job.id} kind={job.kind} lines={order.lines} />
      )}

      {!isTerminal && (
        <Button variant="outline" size="lg" className="h-12 text-status-danger" onClick={() => setFailOpen(true)}>
          <Icon name="alert-triangle" /> Report a problem
        </Button>
      )}

      {job.status === "FAILED" && (
        <div className="rounded-lg border border-status-danger bg-status-danger-bg px-4 py-3 text-sm text-status-danger">
          This job was marked failed. Ops will re-plan it on a future route day.
        </div>
      )}

      <FailDialog jobId={job.id} open={failOpen} onOpenChange={setFailOpen} />
    </div>
  );
}

function CompletionPanel({
  jobId,
  kind,
  lines,
}: {
  jobId: string;
  kind: "PICKUP" | "DELIVERY";
  lines: { garment_type: string; garment_type_name: string; declared_qty: number }[];
}) {
  const completeJob = useCompleteJobField();
  const createProof = useCreateProofField();
  const [declared, setDeclared] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.garment_type, l.declared_qty]))
  );
  const [bagCode, setBagCode] = useState("");
  const [bagCodes, setBagCodes] = useState<string[]>([]);
  const [otpVerified, setOtpVerified] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addBagCode() {
    const trimmed = bagCode.trim();
    if (!trimmed || bagCodes.includes(trimmed)) {
      setBagCode("");
      return;
    }
    setBagCodes((codes) => [...codes, trimmed]);
    setBagCode("");
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    createProof.mutate({ jobId, kind: "PHOTO", file });
    e.target.value = "";
  }

  function handleComplete() {
    const declaredLines: DeclaredLine[] =
      kind === "PICKUP"
        ? Object.entries(declared).map(([garment_type, qty]) => ({ garment_type, qty }))
        : [];
    completeJob.mutate({
      jobId,
      declared_lines: declaredLines,
      bag_codes: kind === "DELIVERY" ? bagCodes : [],
      otp_verified: otpVerified,
    });
  }

  const canComplete = kind === "PICKUP" || bagCodes.length > 0;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border-default bg-surface-raised p-4">
      <p className="font-display text-sm font-bold text-text-primary">
        Complete {kind === "PICKUP" ? "pickup" : "delivery"}
      </p>

      {kind === "PICKUP" ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-muted">Count what you&apos;re actually collecting.</p>
          {lines.map((line) => (
            <div key={line.garment_type} className="flex items-center justify-between gap-2">
              <span className="text-sm text-text-primary">{line.garment_type_name}</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9"
                  onClick={() =>
                    setDeclared((d) => ({ ...d, [line.garment_type]: Math.max(0, (d[line.garment_type] ?? 0) - 1) }))
                  }
                  aria-label={`Decrease ${line.garment_type_name}`}
                >
                  −
                </Button>
                <span className="w-6 text-center tabular-nums">{declared[line.garment_type] ?? 0}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9"
                  onClick={() =>
                    setDeclared((d) => ({ ...d, [line.garment_type]: (d[line.garment_type] ?? 0) + 1 }))
                  }
                  aria-label={`Increase ${line.garment_type_name}`}
                >
                  +
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-muted">Scan every bag you&apos;re handing over.</p>
          <div className="flex gap-2">
            <Input
              placeholder="Scan or type a bag code…"
              value={bagCode}
              onChange={(e) => setBagCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addBagCode();
                }
              }}
              className="h-11 flex-1"
              autoFocus
            />
            <Button type="button" variant="outline" onClick={addBagCode} disabled={!bagCode.trim()}>
              <Icon name="scan-tag" /> Add
            </Button>
          </div>
          {bagCodes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {bagCodes.map((c) => (
                <Badge key={c} variant="neutral" className="font-mono">
                  {c}
                  <button
                    type="button"
                    onClick={() => setBagCodes((codes) => codes.filter((x) => x !== c))}
                    aria-label={`Remove ${c}`}
                    className="ml-1"
                  >
                    <Icon name="close" className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border-default pt-3">
        <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">Proof</p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhoto}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Icon name="camera" /> Photo
          </Button>
          <Button
            type="button"
            variant={otpVerified ? "primary" : "outline"}
            size="sm"
            onClick={() => setOtpVerified((v) => !v)}
          >
            <Icon name="shield" /> {otpVerified ? "OTP verified" : "Verify OTP"}
          </Button>
        </div>
      </div>

      <Button
        size="lg"
        className="h-14 text-base"
        loading={completeJob.isPending}
        disabled={!canComplete}
        onClick={handleComplete}
      >
        <Icon name="check-circle" /> Complete {kind === "PICKUP" ? "pickup" : "delivery"}
      </Button>
    </div>
  );
}

function FailDialog({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const failJob = useFailJobField();
  const [reason, setReason] = useState(FAIL_REASONS[0].code);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (failJob.isSuccess) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failJob.isSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>This marks the job failed — ops will re-plan it.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FAIL_REASONS.map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fail-note">Notes (optional)</Label>
            <textarea
              id="fail-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-border-default bg-surface-base px-3 py-2 text-sm text-text-primary shadow-xs placeholder:text-text-muted focus-visible:border-border-focus"
              placeholder="Anything ops should know…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={failJob.isPending}
            onClick={() => failJob.mutate({ jobId, reason_code: reason, note })}
          >
            Mark failed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

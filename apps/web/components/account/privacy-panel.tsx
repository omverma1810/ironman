"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { authApi, privacyApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import { useCustomerAuth } from "@/lib/customer-auth";

/**
 * My account → Privacy (docs/06 §5–6): download a copy of your data, and
 * delete your account. Deletion needs a fresh code to the account's phone,
 * is refused with reasons while something is still open, and only takes
 * effect after the grace period.
 */
export function PrivacyPanel() {
  return (
    <div className="flex flex-col gap-4">
      <ExportCard />
      <DeleteCard />
    </div>
  );
}

function ExportCard() {
  const auth = useCustomerAuth();
  const mutation = useMutation({
    mutationFn: () => privacyApi.exportData(auth.accessToken as string),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ironman-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Your data is downloading");
    },
    onError: () => toast.error("Couldn't prepare your data. Please try again."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Download my data</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">
          A file with everything we hold about you: your profile, addresses, consents, orders,
          invoices, payments, credit and feedback.
        </p>
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          <Icon name="download" />
          {mutation.isPending ? "Preparing…" : "Download my data"}
        </Button>
      </CardContent>
    </Card>
  );
}

function DeleteCard() {
  const auth = useCustomerAuth();
  const [open, setOpen] = useState(false);
  const check = useQuery({
    queryKey: ["my-deletion-check"],
    queryFn: () => privacyApi.deletionCheck(auth.accessToken as string),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete my account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">
          We remove your name, phone number, flat number and delivery photos. Invoices and payments
          are kept without your name, because the law requires us to keep them for eight years.
        </p>
        {check.isPending && <Skeleton className="h-10 w-48" />}
        {check.isError && (
          <p className="text-sm text-text-muted">
            Couldn&rsquo;t check your account right now. Please try again in a moment.
          </p>
        )}
        {check.data && !check.data.can_delete && (
          <div
            className="flex flex-col gap-2 rounded-md border border-status-warning bg-status-warning-bg p-3"
            data-testid="deletion-blockers"
          >
            <p className="text-sm font-medium text-text-primary">Settle these first:</p>
            <ul className="flex flex-col gap-1">
              {check.data.blockers.map((b) => (
                <li key={b.code} className="ml-4 list-disc text-sm text-text-secondary">
                  {b.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {check.data?.can_delete && (
          <Button variant="danger" className="self-start" onClick={() => setOpen(true)}>
            Delete my account
          </Button>
        )}
      </CardContent>
      {check.data?.can_delete && (
        <DeleteDialog open={open} onOpenChange={setOpen} graceDays={check.data.grace_days} />
      )}
    </Card>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  graceDays,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  graceDays: number;
}) {
  const auth = useCustomerAuth();
  const phone = auth.user?.phone ?? "";
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () => authApi.otpRequest(phone, "VERIFY"),
    onSuccess: () => {
      setCodeSent(true);
      toast.success(`Code sent to ${phone}`);
    },
    onError: () => toast.error("Couldn't send a code. Wait a minute and try again."),
  });

  const remove = useMutation({
    mutationFn: () =>
      privacyApi.deleteAccount(
        { code, reason: reason.trim() || undefined },
        auth.accessToken as string
      ),
    onSuccess: (result) => setScheduledFor(result.scheduled_for),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete your account."),
  });

  if (scheduledFor) {
    return (
      <Dialog open={open} onOpenChange={(next) => !next && auth.logout()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your account is closed</DialogTitle>
            <DialogDescription>
              Your details will be deleted on {formatDate(scheduledFor)}. Changed your mind? Sign in
              again before then, or use the link we&rsquo;ve sent to your phone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={auth.logout}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            You&rsquo;ll be signed out at once. After {graceDays} days your details are deleted for
            good and can&rsquo;t be recovered.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="delete-reason">Why are you leaving? (optional)</Label>
            <textarea
              id="delete-reason"
              maxLength={500}
              className="min-h-16 w-full rounded-md border border-border-default bg-surface-base p-3 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-border-focus"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {!codeSent ? (
            <p className="text-sm text-text-secondary">
              To confirm it&rsquo;s you, we&rsquo;ll send a code to {phone}.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delete-code">6-digit code sent to {phone}</Label>
              <Input
                id="delete-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep my account
          </Button>
          {!codeSent ? (
            <Button variant="danger" onClick={() => send.mutate()} disabled={send.isPending}>
              Send code
            </Button>
          ) : (
            <Button
              variant="danger"
              onClick={() => remove.mutate()}
              disabled={code.length !== 6 || remove.isPending}
            >
              Delete my account
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

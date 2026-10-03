"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCommissionRules,
  useCreateSettlement,
  usePartnerAccruals,
  usePartnerBalance,
  useSetPartnerCommissionRule,
  useVoidAccrual,
} from "@/lib/api/hooks";
import { formatDate, formatMoneyMinor } from "@/lib/format";
import type { AccrualStatus, CommissionAccrual, ReferralPartner } from "@/lib/api/types";
import { describeRule } from "./commission-format";

const HUB_DEFAULT = "default";

export const ACCRUAL_BADGE: Record<
  AccrualStatus,
  { label: string; variant: "warning" | "info" | "success" | "neutral" }
> = {
  ACCRUED: { label: "Unpaid", variant: "warning" },
  APPROVED: { label: "In settlement", variant: "info" },
  SETTLED: { label: "Paid", variant: "success" },
  VOID: { label: "Void", variant: "neutral" },
};

function Tile({ label, minor, emphasis }: { label: string; minor?: number; emphasis?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border-default px-3 py-2">
      <span className="text-xs text-text-muted">{label}</span>
      {minor === undefined ? (
        <Skeleton className="h-5 w-16" />
      ) : (
        <span
          className={
            emphasis
              ? "text-base font-semibold text-text-primary tabular-nums"
              : "text-base text-text-secondary tabular-nums"
          }
        >
          {formatMoneyMinor(minor)}
        </span>
      )}
    </div>
  );
}

export function PartnerCommissionDialog({
  partner,
  canManage,
  open,
  onOpenChange,
}: {
  partner: ReferralPartner | null;
  /** Founder: may change the rule, settle and void. */
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const partnerId = open && partner ? partner.id : null;
  const balance = usePartnerBalance(partnerId);
  const accruals = usePartnerAccruals(partnerId);
  const rules = useCommissionRules(open);
  const setRule = useSetPartnerCommissionRule();
  const createSettlement = useCreateSettlement();
  const voidAccrual = useVoidAccrual();
  const [voiding, setVoiding] = useState<CommissionAccrual | null>(null);
  const [reason, setReason] = useState("");

  if (!partner) return null;
  const ruleList = rules.data?.results ?? [];
  const hubDefault = ruleList.find((r) => r.is_default);
  const accrued = balance.data?.accrued_minor ?? 0;
  const rows = accruals.data?.results ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{partner.name} — commission</DialogTitle>
          <DialogDescription>
            Earned automatically when a customer they referred has an order delivered.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Unpaid" minor={balance.data?.accrued_minor} emphasis />
          <Tile label="In settlement" minor={balance.data?.in_settlement_minor} />
          <Tile label="Paid to date" minor={balance.data?.paid_minor} />
          <Tile label="Voided" minor={balance.data?.void_minor} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-primary">Rule</span>
          {canManage ? (
            <Select
              value={partner.commission_rule ?? HUB_DEFAULT}
              onValueChange={(v) =>
                setRule.mutate({ id: partner.id, ruleId: v === HUB_DEFAULT ? null : v })
              }
            >
              <SelectTrigger aria-label="Commission rule">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={HUB_DEFAULT}>
                  Hub default{hubDefault ? ` (${hubDefault.name})` : " (none set)"}
                </SelectItem>
                {ruleList.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} — {describeRule(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-text-secondary">
              {partner.commission_rule_name ||
                (hubDefault ? `Hub default (${hubDefault.name})` : "Hub default (none set)")}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-primary">Earnings</span>
          {accruals.isLoading ? (
            <Skeleton className="h-24" />
          ) : rows.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nothing earned yet. Commission appears here once a customer this partner referred has
              an order delivered.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-md border border-border-default">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-raised text-left text-xs text-text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Order</th>
                    <th className="px-3 py-2 font-medium">Earned</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    {canManage && <th className="px-3 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className="border-t border-border-subtle">
                      <td className="px-3 py-2 font-mono text-xs">{a.order_ref}</td>
                      <td className="px-3 py-2 text-text-secondary">{formatDate(a.accrued_at)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoneyMinor(a.amount_minor)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={ACCRUAL_BADGE[a.status].variant}>
                          {ACCRUAL_BADGE[a.status].label}
                        </Badge>
                        {a.settlement_ref && (
                          <span className="ml-2 text-xs text-text-muted">{a.settlement_ref}</span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-3 py-2 text-right">
                          {a.status === "ACCRUED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setReason("");
                                setVoiding(a);
                              }}
                            >
                              Void
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {voiding && (
          <div className="flex flex-col gap-2 rounded-md border border-border-default p-3">
            <span className="text-sm text-text-primary">
              Void {formatMoneyMinor(voiding.amount_minor)} on {voiding.order_ref}? Say why — it
              goes on the audit log.
            </span>
            <div className="flex gap-2">
              <Input
                aria-label="Reason for voiding"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. partner referred their own flat"
              />
              <Button variant="secondary" onClick={() => setVoiding(null)}>
                Keep
              </Button>
              <Button
                variant="danger"
                disabled={!reason.trim()}
                loading={voidAccrual.isPending}
                onClick={() =>
                  voidAccrual.mutate(
                    { id: voiding.id, reason: reason.trim() },
                    { onSuccess: () => setVoiding(null) }
                  )
                }
              >
                Void
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canManage && (
            <Button
              disabled={accrued <= 0}
              loading={createSettlement.isPending}
              onClick={() =>
                createSettlement.mutate(
                  { partner: partner.id },
                  { onSuccess: () => onOpenChange(false) }
                )
              }
            >
              Settle {formatMoneyMinor(accrued)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

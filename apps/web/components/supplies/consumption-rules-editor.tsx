"use client";

import { useEffect, useMemo, useState } from "react";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { EmptyState } from "@/components/patterns/empty-state";
import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
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
  useAllGarmentTypes,
  useConsumptionRules,
  useReplaceConsumptionRules,
  useServices,
} from "@/lib/api/hooks";
import type { ConsumptionRule, StockItem } from "@/lib/api/types";

const ANY_GARMENT = "any";

type Draft = {
  key: string;
  service: string;
  garment_type: string; // ANY_GARMENT = the whole service
  stock_item: string;
  qty: string;
};

let draftCounter = 0;
const nextKey = () => `draft-${++draftCounter}`;

function fromRule(rule: ConsumptionRule): Draft {
  return {
    key: rule.id,
    service: rule.service,
    garment_type: rule.garment_type ?? ANY_GARMENT,
    stock_item: rule.stock_item,
    qty: String(Math.round(Number(rule.qty_per_unit))),
  };
}

function isComplete(d: Draft): boolean {
  const qty = Number(d.qty);
  return !!d.service && !!d.stock_item && Number.isInteger(qty) && qty >= 1;
}

/** Draft minus its React key — what actually gets saved, so it's what
 * "unsaved changes" compares. */
function signature(drafts: Draft[]): string {
  return JSON.stringify(drafts.map((d) => [d.service, d.garment_type, d.stock_item, d.qty]));
}

function identity(d: Draft): string {
  return `${d.service}|${d.garment_type}|${d.stock_item}`;
}

/** "1 hanger + 1 poly cover per shirt" — what gets auto-issued (and costed
 * onto the order) when a garment passes QC into PACKED. The server stores
 * the whole set as one replace-all PUT (docs/04 §3.8), so this edits a
 * local draft and saves it in one go. Quantities are whole units: the
 * auto-issue rounds to a whole piece, so a fractional rule would silently
 * issue nothing. */
export function ConsumptionRulesEditor({ items }: { items: StockItem[] }) {
  const rulesQuery = useConsumptionRules();
  const servicesQuery = useServices();
  const garmentsQuery = useAllGarmentTypes();
  const replace = useReplaceConsumptionRules();

  const services = servicesQuery.data?.results ?? [];
  const garmentTypes = garmentsQuery.data?.results ?? [];
  const activeItems = items.filter((i) => i.is_active);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [baseline, setBaseline] = useState("");

  useEffect(() => {
    if (!rulesQuery.data) return;
    const next = rulesQuery.data.map(fromRule);
    setDrafts(next);
    setBaseline(signature(next));
  }, [rulesQuery.data]);

  const dirty = useMemo(() => signature(drafts) !== baseline, [drafts, baseline]);

  const duplicate = useMemo(() => {
    const seen = new Set<string>();
    for (const d of drafts) {
      const id = identity(d);
      if (seen.has(id)) return true;
      seen.add(id);
    }
    return false;
  }, [drafts]);

  const canSave = dirty && !duplicate && drafts.every(isComplete);

  function update(key: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function addRule() {
    setDrafts((prev) => [
      ...prev,
      {
        key: nextKey(),
        service: services[0]?.id ?? "",
        garment_type: ANY_GARMENT,
        stock_item: activeItems[0]?.id ?? "",
        qty: "1",
      },
    ]);
  }

  function handleSave() {
    replace.mutate(
      drafts.map((d) => ({
        service: d.service,
        garment_type: d.garment_type === ANY_GARMENT ? null : d.garment_type,
        stock_item: d.stock_item,
        qty_per_unit: Number(d.qty).toFixed(2),
      }))
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-text-secondary">
        When a garment passes QC and is packed, these quantities are taken off stock automatically
        and their cost is added to the order. Choose &ldquo;Every garment&rdquo; for something used
        once per garment under that service, or pick one garment type for a specific rule.
      </p>

      <AsyncBoundary
        query={rulesQuery}
        loading={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        }
      >
        {() => (
          <>
            {drafts.length === 0 ? (
              <EmptyState
                icon="package-open"
                title="No consumption rules yet"
                body="Add a rule so hangers, covers and bags come off stock automatically when garments are packed."
                action={
                  <Button
                    size="sm"
                    onClick={addRule}
                    disabled={!services.length || !activeItems.length}
                  >
                    <Icon name="plus" /> Add the first rule
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {drafts.map((d) => {
                  const garments = garmentTypes.filter((g) => g.service === d.service);
                  return (
                    <div
                      key={d.key}
                      className="grid grid-cols-1 gap-2 rounded-md border border-border-default bg-surface-raised p-3 md:grid-cols-6 md:items-center"
                    >
                      <Select
                        value={d.service}
                        onValueChange={(v) =>
                          update(d.key, {
                            service: v,
                            garment_type: ANY_GARMENT,
                          })
                        }
                      >
                        <SelectTrigger aria-label="Service">
                          <SelectValue placeholder="Service" />
                        </SelectTrigger>
                        <SelectContent>
                          {services.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={d.garment_type}
                        onValueChange={(v) => update(d.key, { garment_type: v })}
                      >
                        <SelectTrigger aria-label="Garment type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ANY_GARMENT}>Every garment</SelectItem>
                          {garments.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={d.stock_item}
                        onValueChange={(v) => update(d.key, { stock_item: v })}
                      >
                        <SelectTrigger aria-label="Stock item" className="md:col-span-2">
                          <SelectValue placeholder="Stock item" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.sku} — {i.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        type="number"
                        min={1}
                        step={1}
                        aria-label="Quantity per garment"
                        value={d.qty}
                        onChange={(e) => update(d.key, { qty: e.target.value })}
                      />

                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Remove rule"
                        onClick={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}
                      >
                        <Icon name="close" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {duplicate && (
              <p role="alert" className="text-sm text-status-danger">
                Two rules use the same service, garment and item. Remove one before saving.
              </p>
            )}

            {drafts.length > 0 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={addRule}>
                  <Icon name="plus" /> Add rule
                </Button>
                <Button
                  size="sm"
                  loading={replace.isPending}
                  disabled={!canSave}
                  onClick={handleSave}
                >
                  Save rules
                </Button>
              </div>
            )}
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}

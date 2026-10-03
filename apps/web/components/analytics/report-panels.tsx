"use client";

import { useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/patterns/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApartmentPerformance,
  useChannelPerformance,
  useCheckpoint,
  useDataQuality,
  useHubs,
  useOperationsDaily,
  useUnitEconomics,
} from "@/lib/api/hooks";
import { formatDate, formatMoneyMinor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PeriodPicker, periodRange } from "./period-picker";
import { cellValue, columnLabel } from "./metric-format";

const money = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : formatMoneyMinor(v);
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);

function useHub() {
  return useHubs().data?.results[0]?.id;
}

function Table({
  headers,
  rows,
  align,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  /** "r" right-aligns a numeric column. */
  align?: ("l" | "r")[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border-default bg-surface-raised">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-text-muted">
          <tr>
            {headers.map((h, i) => (
              <th
                key={h}
                className={cn(
                  "px-3 py-2 font-medium whitespace-nowrap",
                  align?.[i] === "r" && "text-right"
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-t border-border-subtle">
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-3 py-2 whitespace-nowrap tabular-nums",
                    align?.[i] === "r" && "text-right"
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Toolbar({
  days,
  setDays,
  note,
}: {
  days: string;
  setDays: (v: string) => void;
  note: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-text-muted">{note}</p>
      <PeriodPicker value={days} onChange={setDays} />
    </div>
  );
}

// 6.3 ---------------------------------------------------------------------------

export function ApartmentsPanel({ showMargin }: { showMargin: boolean }) {
  const hub = useHub();
  const [days, setDays] = useState("30");
  const query = useApartmentPerformance({ hub, ...periodRange(days) });
  const rows = query.data?.rows ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        days={days}
        setDays={setDays}
        note="Ranked by orders per customer per week live — a building launched last week isn't judged on raw volume against one live for months."
      />
      {query.isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <Table
          headers={[
            "Apartment",
            "Live for",
            "Customers",
            "New",
            "Orders",
            "Orders / customer",
            "Repeat",
            "Avg order",
            ...(showMargin ? ["Money made"] : []),
            "Rating",
          ]}
          align={[
            "l",
            "r",
            "r",
            "r",
            "r",
            "r",
            "r",
            "r",
            ...(showMargin ? ["r" as const] : []),
            "r",
          ]}
          rows={rows.map((r) => [
            <div key="n" className="flex flex-col">
              <span className="font-medium text-text-primary">{r.name}</span>
              <span className="text-xs text-text-muted">{r.cluster}</span>
            </div>,
            r.days_since_launch === null ? "—" : `${r.days_since_launch} days`,
            r.customers,
            r.new_customers,
            r.orders,
            r.orders_per_customer ?? "—",
            pct(r.repeat_rate),
            money(r.aov_minor),
            ...(showMargin ? [money(r.margin_minor)] : []),
            r.avg_rating === null ? "—" : `${r.avg_rating} ★`,
          ])}
        />
      )}
    </div>
  );
}

// 6.4 ---------------------------------------------------------------------------

export function ChannelsPanel() {
  const hub = useHub();
  const [days, setDays] = useState("90");
  const query = useChannelPerformance({ hub, ...periodRange(days) });
  const rows = query.data?.rows ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        days={days}
        setDays={setDays}
        note="For customers acquired in the period: what they cost, whether they came back, and what they spent in their first 60 days."
      />
      {query.isLoading ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="chart"
          title="No new customers in this period"
          body="Try a longer period."
        />
      ) : (
        <Table
          headers={[
            "Channel",
            "New customers",
            "Spend",
            "Commission",
            "Cost per customer",
            "Came back",
            "60-day revenue / customer",
          ]}
          align={["l", "r", "r", "r", "r", "r", "r"]}
          rows={rows.map((r) => [
            <span key="c" className="font-medium text-text-primary">
              {r.channel_name}
            </span>,
            r.new_customers,
            money(r.spend_minor),
            money(r.commission_minor),
            money(r.cac_minor),
            pct(r.repeat_rate),
            money(r.revenue_60d_per_customer_minor),
          ])}
        />
      )}
    </div>
  );
}

// 6.5 ---------------------------------------------------------------------------

export function UnitEconomicsPanel() {
  const hub = useHub();
  const [days, setDays] = useState("30");
  const query = useUnitEconomics({ hub, ...periodRange(days) });
  const data = query.data;
  const revenue = data?.steps[0]?.total_minor ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        days={days}
        setDays={setDays}
        note="Revenue less the direct costs of each order. Rent, salaries and the press itself aren't included — this is contribution, not profit."
      />
      {query.isLoading || !data ? (
        <Skeleton className="h-56" />
      ) : data.orders === 0 ? (
        <EmptyState
          icon="chart"
          title="No invoiced deliveries in this period"
          body="Try a longer period."
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            {data.steps.map((s) => {
              const isTotal = s.step === "Revenue" || s.step === "Contribution";
              const share = revenue ? Math.abs(s.total_minor) / revenue : 0;
              return (
                <div key={s.step} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "w-36 shrink-0 text-sm",
                      isTotal ? "font-semibold text-text-primary" : "text-text-secondary"
                    )}
                  >
                    {s.step}
                  </span>
                  <div className="h-3 flex-1 rounded-sm bg-surface-sunken">
                    <div
                      className={cn(
                        "h-3 rounded-sm",
                        s.step === "Contribution"
                          ? "bg-status-success"
                          : isTotal
                            ? "bg-brand-yellow"
                            : "bg-status-danger"
                      )}
                      style={{ width: `${Math.max(share * 100, s.total_minor ? 1 : 0)}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right text-sm tabular-nums">
                    {money(s.total_minor)}
                  </span>
                  <span className="hidden w-28 shrink-0 text-right text-xs text-text-muted tabular-nums sm:inline">
                    {money(s.per_order_minor)} / order
                  </span>
                </div>
              );
            })}
            <p className="text-xs text-text-muted">
              {data.orders} delivered orders · {pct(data.margin_pct)} margin. Labour is an estimate
              from the configured rate.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 6.7 ---------------------------------------------------------------------------

export function OperationsPanel() {
  const hub = useHub();
  const query = useOperationsDaily(hub);
  const data = query.data;
  if (query.isLoading || !data) return <Skeleton className="h-56" />;
  const exceptions = data.open_exceptions;
  const tiles: [string, string, string?][] = [
    ["On time today", pct(data.on_time.value), `${data.on_time.jobs} jobs`],
    ["Pickups", pct(data.on_time.pickup)],
    ["Deliveries", pct(data.on_time.delivery)],
    [
      "Slots booked",
      `${data.capacity.booked} / ${data.capacity.slots}`,
      data.capacity.utilisation === null ? "No slots today" : `${data.capacity.utilisation}% full`,
    ],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <div
            key={label}
            className="rounded-lg border border-border-default bg-surface-raised p-4"
          >
            <p className="text-sm text-text-secondary">{label}</p>
            <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
            {sub && <p className="text-xs text-text-muted">{sub}</p>}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Work in progress</CardTitle>
          </CardHeader>
          <CardContent>
            {data.wip.length === 0 ? (
              <p className="text-sm text-text-muted">Nothing in progress.</p>
            ) : (
              <Table
                headers={["Stage", "Orders", "Oldest", "Average"]}
                align={["l", "r", "r", "r"]}
                rows={data.wip.map((w) => [
                  w.label,
                  w.orders,
                  <span
                    key="o"
                    className={cn(w.oldest_hours > 48 && "font-medium text-status-danger")}
                  >
                    {w.oldest_hours} h
                  </span>,
                  `${w.average_hours} h`,
                ])}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Overdue deliveries</CardTitle>
            <div className="flex gap-1.5">
              {(["HIGH", "MEDIUM", "LOW"] as const).map((sev) =>
                exceptions[sev] ? (
                  <Badge
                    key={sev}
                    variant={sev === "HIGH" ? "danger" : sev === "MEDIUM" ? "warning" : "neutral"}
                  >
                    {exceptions[sev]} {sev.toLowerCase()} exception
                    {exceptions[sev] === 1 ? "" : "s"}
                  </Badge>
                ) : null
              )}
            </div>
          </CardHeader>
          <CardContent>
            {data.overdue.length === 0 ? (
              <p className="text-sm text-text-muted">Nothing is past its promised delivery time.</p>
            ) : (
              <Table
                headers={["Order", "Customer", "Status", "Late by"]}
                align={["l", "l", "l", "r"]}
                rows={data.overdue.map((o) => [
                  <Link
                    key="r"
                    href={`/console/orders/${o.order}`}
                    className="font-mono text-xs hover:underline"
                  >
                    {o.ref}
                  </Link>,
                  o.customer,
                  o.status,
                  <span key="h" className="font-medium text-status-danger">
                    {o.hours_late} h
                  </span>,
                ])}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// 6.6 ---------------------------------------------------------------------------

export function CheckpointPanel() {
  const hub = useHub();
  const query = useCheckpoint({ hub });
  const cp = query.data;
  if (query.isLoading || !cp) return <Skeleton className="h-56" />;
  if (!cp.launched_on) {
    return (
      <EmptyState
        icon="chart"
        title="Nothing delivered yet"
        body="The checkpoint report starts from the first delivered order."
      />
    );
  }
  const answers: [string, string][] = [
    [
      "Are customers using the service?",
      `${cp.orders} delivered orders from ${cp.customers} customers (${cp.orders_per_customer ?? "—"} each).`,
    ],
    [
      "Which customers are coming back?",
      cp.cohort_repeat_rate === null
        ? "Too early — nobody's first order is 30 days old yet."
        : `${cp.cohort_repeat_rate}% of the ${cp.cohort_size} customers old enough to judge reordered within 30 days.`,
    ],
    [
      "Is our pricing making sense?",
      `Average order ${money(cp.aov_minor)}, of which ${money(cp.contribution_per_order_minor)} (${pct(cp.margin_pct)}) is left after direct costs.`,
    ],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-display text-xl font-semibold">Day {cp.days_live}</span>
        <span className="text-sm text-text-muted">
          since the first delivery on {formatDate(cp.launched_on)} · heading for the Day{" "}
          {cp.checkpoint} checkpoint
        </span>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          {answers.map(([q, a]) => (
            <div key={q}>
              <p className="text-sm font-medium text-text-primary">{q}</p>
              <p className="text-sm text-text-secondary">{a}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <h3 className="text-sm font-semibold text-text-primary">Which apartments are working?</h3>
      <Table
        headers={["Apartment", "Customers", "Orders", "Orders / customer", "Repeat"]}
        align={["l", "r", "r", "r", "r"]}
        rows={cp.top_apartments.map((r) => [
          r.name,
          r.customers,
          r.orders,
          r.orders_per_customer ?? "—",
          pct(r.repeat_rate),
        ])}
      />
      <h3 className="text-sm font-semibold text-text-primary">
        Which marketing channels are worth continuing?
      </h3>
      <Table
        headers={[
          "Channel",
          "New customers",
          "Cost per customer",
          "Came back",
          "60-day revenue / customer",
        ]}
        align={["l", "r", "r", "r", "r"]}
        rows={cp.channels.map((r) => [
          r.channel_name,
          r.new_customers,
          money(r.cac_minor),
          pct(r.repeat_rate),
          money(r.revenue_60d_per_customer_minor),
        ])}
      />
      {cp.price_versions.length > 1 && (
        <>
          <h3 className="text-sm font-semibold text-text-primary">Price list versions</h3>
          <Table
            headers={["Version", "Orders", "Average order"]}
            align={["l", "r", "r"]}
            rows={cp.price_versions.map((p) => [
              p.version ?? "—",
              p.orders,
              money(p.avg_order_minor),
            ])}
          />
        </>
      )}
    </div>
  );
}

// 6.9 ---------------------------------------------------------------------------

export function DataQualityPanel() {
  const hub = useHub();
  const query = useDataQuality(hub);
  const [open, setOpen] = useState<string | null>(null);
  const data = query.data;
  if (query.isLoading || !data) return <Skeleton className="h-56" />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-muted">
        {data.failing === 0
          ? "Every check passes — the numbers can be trusted."
          : `${data.failing} check${data.failing === 1 ? "" : "s"} need attention before the numbers can be fully trusted.`}
      </p>
      {data.checks.map((c) => {
        const keys = c.rows.length ? Object.keys(c.rows[0]) : [];
        const isPct = c.key === "unknown_channel" || c.key === "manual_stage_moves";
        return (
          <Card key={c.key}>
            <CardContent className="flex flex-col gap-2 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={c.ok ? "success" : "warning"} dot>
                    {c.ok ? "OK" : "Needs attention"}
                  </Badge>
                  <span className="text-sm font-medium text-text-primary">{c.label}</span>
                </div>
                <span className="text-sm text-text-secondary tabular-nums">
                  {isPct ? `${c.value}%` : c.value} (limit {isPct ? `${c.threshold}%` : c.threshold}
                  )
                </span>
              </div>
              {!c.ok && <p className="text-sm text-text-muted">{c.explain}</p>}
              {c.row_count > 0 && (
                <button
                  type="button"
                  className="self-start text-sm text-text-secondary underline-offset-4 hover:underline"
                  onClick={() => setOpen(open === c.key ? null : c.key)}
                >
                  {open === c.key ? "Hide" : "Show"} {c.row_count} row{c.row_count === 1 ? "" : "s"}
                </button>
              )}
              {open === c.key && keys.length > 0 && (
                <Table
                  headers={keys.map(columnLabel)}
                  rows={c.rows.map((r) => keys.map((k) => cellValue(k, r[k])))}
                />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

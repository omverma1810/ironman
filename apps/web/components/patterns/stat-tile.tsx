import type { IconName } from "@/components/icons/icon";
import { Icon } from "@/components/icons/icon";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  delta,
  deltaDirection,
  icon,
  className,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  icon?: IconName;
  className?: string;
}) {
  const deltaColor =
    deltaDirection === "up"
      ? "text-status-success"
      : deltaDirection === "down"
        ? "text-status-danger"
        : "text-text-muted";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border-default bg-surface-raised p-4 shadow-xs",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-text-muted uppercase">{label}</span>
        {icon && <Icon name={icon} className="size-4 text-text-muted" />}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-2xl font-semibold text-text-primary tabular-nums">
          {value}
        </span>
        {delta && <span className={cn("text-xs font-medium tabular-nums", deltaColor)}>{delta}</span>}
      </div>
    </div>
  );
}

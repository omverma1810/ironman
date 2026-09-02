import type { IconName } from "@/components/icons/icon";
import { Icon } from "@/components/icons/icon";

export function EmptyState({
  icon = "package-open",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-default px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-sunken">
        <Icon name={icon} className="size-6 text-text-muted" />
      </div>
      <p className="font-display text-sm font-semibold text-text-primary">{title}</p>
      {body && <p className="max-w-sm text-sm text-text-secondary">{body}</p>}
      {action}
    </div>
  );
}

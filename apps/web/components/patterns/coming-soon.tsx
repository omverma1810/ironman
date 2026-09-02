import type { IconName } from "@/components/icons/icon";
import { Icon } from "@/components/icons/icon";

/** Used for nav destinations not yet built in this phase (docs/08). A
 * placeholder is honest; a dead link or a fake empty screen is not. */
export function ComingSoon({
  icon,
  title,
  body,
  phase,
}: {
  icon: IconName;
  title: string;
  body: string;
  phase: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-default px-6 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-sunken">
        <Icon name={icon} className="size-7 text-text-muted" />
      </div>
      <h2 className="font-display text-base font-semibold text-text-primary">{title}</h2>
      <p className="max-w-md text-sm text-text-secondary">{body}</p>
      <span className="mt-1 rounded-pill bg-status-info-bg px-3 py-1 text-xs font-medium text-status-info">
        {phase}
      </span>
    </div>
  );
}

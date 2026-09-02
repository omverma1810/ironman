import { Icon } from "@/components/icons/icon";

export function PermissionDenied({ required }: { required?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border-default bg-surface-sunken px-6 py-10 text-center">
      <Icon name="lock" className="size-8 text-text-muted" />
      <p className="max-w-sm text-sm text-text-primary">
        You don&apos;t have access to this{required ? ` (needs ${required})` : ""}.
      </p>
      <p className="text-xs text-text-muted">Ask an admin if you think this is wrong.</p>
    </div>
  );
}

import { cn } from "@/lib/utils";
import { formatMoneyMinor } from "@/lib/format";

export function MoneyText({
  minor,
  currency = "INR",
  className,
  muted,
}: {
  minor: number;
  currency?: string;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span className={cn("tabular-nums", muted && "text-text-muted", className)}>
      {formatMoneyMinor(minor, currency)}
    </span>
  );
}

import { Text, View } from "react-native";
import type { JobKind, JobStatus } from "../lib/types";

const LABEL: Record<JobStatus, string> = {
  PENDING: "Not started",
  EN_ROUTE: "On the way",
  ARRIVED: "Arrived",
  DONE: "Done",
  FAILED: "Problem reported",
};

const STYLE: Record<JobStatus, string> = {
  PENDING: "bg-gray-200 text-brand-ink",
  EN_ROUTE: "bg-blue-100 text-blue-900",
  ARRIVED: "bg-amber-100 text-amber-900",
  DONE: "bg-green-100 text-green-900",
  FAILED: "bg-red-100 text-red-900",
};

export function StatusChip({ status }: { status: JobStatus }) {
  const [box, text] = STYLE[status].split(" ");
  return (
    <View className={`self-start rounded-pill px-3 py-1 ${box}`}>
      <Text className={`font-semibold text-sm ${text}`}>{LABEL[status]}</Text>
    </View>
  );
}

export function kindLabel(kind: JobKind): string {
  return kind === "PICKUP" ? "Pickup" : "Delivery";
}

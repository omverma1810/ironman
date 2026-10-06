import { Check } from "lucide-react-native";
import { Text, View } from "react-native";
import { color } from "@ironman/tokens";
import { formatDateTime } from "../lib/format";
import { currentStep, STAGE_STEPS } from "../lib/timeline";

/** Seven stages, the current one marked, the ones behind it ticked. */
export function StageProgress({ stage }: { stage: string }) {
  const current = currentStep(stage);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Order progress: ${STAGE_STEPS[Math.max(current, 0)].label}`}
      accessibilityValue={{ min: 0, max: STAGE_STEPS.length - 1, now: Math.max(current, 0) }}
      className="gap-0"
    >
      {STAGE_STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <View key={step.key} className="flex-row gap-3">
            <View className="items-center">
              <View
                className={`size-6 items-center justify-center rounded-full ${
                  done ? "bg-status-success" : active ? "bg-brand-yellow" : "border border-gray-300 bg-white"
                }`}
              >
                {done ? <Check size={14} color="#fff" /> : null}
                {active ? <View className="size-2 rounded-full bg-brand-ink" /> : null}
              </View>
              {index < STAGE_STEPS.length - 1 ? (
                <View className={`w-0.5 flex-1 ${done ? "bg-status-success" : "bg-gray-200"}`} style={{ minHeight: 18 }} />
              ) : null}
            </View>
            <Text
              className={`pb-3 text-base ${
                active ? "font-semibold text-brand-ink" : done ? "text-gray-700" : "text-gray-400"
              }`}
              style={active ? { color: color.brand.ink } : undefined}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function EventList({ events }: { events: { label: string; at: string }[] }) {
  return (
    <View className="gap-3">
      {events.map((event, index) => (
        <View key={`${event.at}-${index}`} className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-sm text-brand-ink">{event.label}</Text>
          <Text className="text-xs text-gray-500">{formatDateTime(event.at)}</Text>
        </View>
      ))}
    </View>
  );
}

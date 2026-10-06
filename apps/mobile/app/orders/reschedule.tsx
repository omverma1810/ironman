import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { ApiError } from "../../lib/api";
import { Banner, Button, Choice, ErrorState, Hint, Loading, Screen, SectionTitle } from "../../components/ui";
import { usePickupSlots } from "../../lib/booking/hooks";
import { formatDay, formatWindow } from "../../lib/format";
import { useRescheduleOrder } from "../../lib/orders";
import { loadServiceArea } from "../../lib/prefs";
import type { PickupSlot } from "../../lib/types";

export default function RescheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const reschedule = useRescheduleOrder();
  const [cluster, setCluster] = useState<string | null | undefined>(undefined);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The area is remembered on this phone from the booking.
  useEffect(() => {
    loadServiceArea().then((area) => setCluster(area?.clusterId ?? null));
  }, []);
  const slots = usePickupSlots(cluster);

  const byDay = useMemo(() => {
    const groups = new Map<string, PickupSlot[]>();
    for (const slot of slots.data ?? []) groups.set(slot.date, [...(groups.get(slot.date) ?? []), slot]);
    return [...groups.entries()];
  }, [slots.data]);

  async function save() {
    if (!slotId) return;
    setError(null);
    try {
      await reschedule.mutateAsync({ id, slotId });
      router.back();
    } catch (err) {
      setError(ApiError.isApiError(err) ? err.message : "Couldn't change the time. Please try again.");
    }
  }

  return (
    <Screen
      footer={
        <Button
          label="Change pickup time"
          testID="save-reschedule"
          loading={reschedule.isPending}
          disabled={!slotId}
          onPress={save}
        />
      }
    >
      {cluster === undefined || slots.isLoading ? <Loading label="Loading pickup times" /> : null}
      {cluster === null ? (
        <Hint>We couldn't tell which area you're in. Please call us to change the time.</Hint>
      ) : null}
      {slots.isError ? <ErrorState message="Couldn't load pickup times." onRetry={() => slots.refetch()} /> : null}
      {slots.isSuccess && byDay.length === 0 ? <Hint>No other times are open in the next two weeks.</Hint> : null}
      {byDay.map(([day, daySlots]) => (
        <View key={day} className="gap-2">
          <SectionTitle>{formatDay(day)}</SectionTitle>
          {daySlots.map((slot) => (
            <Choice
              key={slot.id}
              title={formatWindow(slot.window_start, slot.window_end)}
              subtitle={slot.available > 0 ? (slot.available <= 3 ? `${slot.available} left` : undefined) : "Full"}
              disabled={slot.available <= 0}
              selected={slotId === slot.id}
              onPress={() => setSlotId(slot.id)}
            />
          ))}
        </View>
      ))}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </Screen>
  );
}

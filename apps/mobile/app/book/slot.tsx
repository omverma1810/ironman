import { useRouter } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { Button, Choice, ErrorState, Field, Hint, Loading, Screen, SectionTitle } from "../../components/ui";
import { useBooking } from "../../lib/booking/context";
import { usePickupSlots } from "../../lib/booking/hooks";
import { formatDay, formatWindow } from "../../lib/format";
import type { PickupSlot } from "../../lib/types";

export default function SlotStep() {
  const router = useRouter();
  const { state, dispatch } = useBooking();
  const cluster =
    (state.address?.kind === "new" ? state.address.apartment?.cluster : undefined) ??
    state.area?.clusterId;
  const slots = usePickupSlots(cluster);

  const byDay = useMemo(() => {
    const groups = new Map<string, PickupSlot[]>();
    for (const slot of slots.data ?? []) {
      groups.set(slot.date, [...(groups.get(slot.date) ?? []), slot]);
    }
    return [...groups.entries()];
  }, [slots.data]);

  return (
    <Screen
      footer={<Button label="Continue" testID="slot-continue" onPress={() => router.push("/book/confirm")} />}
    >
      <View className="gap-2">
        <SectionTitle>When should we come?</SectionTitle>
        <Choice
          testID="slot-any"
          title="Any time — you choose for me"
          subtitle="We'll schedule the first available pickup and tell you the time."
          selected={state.slotId === null}
          onPress={() => dispatch({ type: "slot", slotId: null })}
        />
      </View>

      {slots.isLoading ? <Loading label="Loading pickup times" /> : null}
      {slots.isError ? (
        <ErrorState message="Couldn't load pickup times. You can still pick “any time”." onRetry={() => slots.refetch()} />
      ) : null}
      {slots.isSuccess && byDay.length === 0 ? (
        <Hint>No set times are open in the next two weeks, so we'll schedule it for you.</Hint>
      ) : null}

      {byDay.map(([day, daySlots]) => (
        <View key={day} className="gap-2">
          <SectionTitle>{formatDay(day)}</SectionTitle>
          {daySlots.map((slot) => (
            <Choice
              key={slot.id}
              title={formatWindow(slot.window_start, slot.window_end)}
              subtitle={slot.available > 0 ? (slot.available <= 3 ? `${slot.available} left` : undefined) : "Full"}
              disabled={slot.available <= 0}
              selected={state.slotId === slot.id}
              onPress={() => dispatch({ type: "slot", slotId: slot.id })}
            />
          ))}
        </View>
      ))}

      <Field
        label="Anything we should know? (optional)"
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        placeholder="e.g. ring the bell twice, starch the shirts lightly"
        maxLength={500}
        value={state.notes}
        onChangeText={(notes) => dispatch({ type: "notes", notes })}
      />
    </Screen>
  );
}

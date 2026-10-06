import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { ErrorState, Loading } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { BookingProvider } from "../../lib/booking/context";
import type { BookingState } from "../../lib/booking/state";
import { useOrder } from "../../lib/orders";

export default function BookLayout() {
  const { user, isLoading } = useAuth();
  // `?reorder=<order id>`: start from what an earlier order had in it.
  const { reorder } = useLocalSearchParams<{ reorder?: string }>();
  const earlier = useOrder(reorder);

  if (!isLoading && !user) return <Redirect href="/login" />;
  if (reorder && earlier.isLoading) return <Loading label="Loading your earlier order" />;
  if (reorder && earlier.isError) {
    return <ErrorState message="Couldn't load that order." onRetry={() => earlier.refetch()} />;
  }

  const initial: Partial<BookingState> | undefined = earlier.data
    ? {
        serviceId: earlier.data.service,
        counts: Object.fromEntries(
          earlier.data.lines.filter((line) => line.declared_qty > 0).map((line) => [line.garment_type, line.declared_qty])
        ),
      }
    : undefined;

  return (
    <BookingProvider initial={initial}>
      <Stack screenOptions={{ headerShown: true, headerBackTitle: "Back" }}>
        <Stack.Screen name="index" options={{ title: "Pickup address" }} />
        <Stack.Screen name="items" options={{ title: "What's being ironed" }} />
        <Stack.Screen name="slot" options={{ title: "Pickup time" }} />
        <Stack.Screen name="confirm" options={{ title: "Confirm" }} />
        <Stack.Screen name="done" options={{ title: "Booked", headerBackVisible: false, gestureEnabled: false }} />
      </Stack>
    </BookingProvider>
  );
}

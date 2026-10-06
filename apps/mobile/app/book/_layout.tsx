import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../lib/auth";
import { BookingProvider } from "../../lib/booking/context";

export default function BookLayout() {
  const { user, isLoading } = useAuth();
  if (!isLoading && !user) return <Redirect href="/login" />;

  return (
    <BookingProvider>
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

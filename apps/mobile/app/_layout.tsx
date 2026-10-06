import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../lib/auth";
import { configureNotifications, routeForNotification } from "../lib/push";

configureNotifications();

/** Tapping a message opens the order it is about, including when it launched the app. */
function useNotificationTaps() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS === "web") return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const href = routeForNotification(response.notification.request.content.data);
      // After this tick: on a cold start the navigator isn't ready until the
      // layout has rendered once.
      setTimeout(() => {
        try {
          router.push(href as never);
        } catch {
          // Not signed in or navigator still starting: the orders list is where they land.
        }
      }, 0);
    };
    Notifications.getLastNotificationResponseAsync?.().then(open).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [router]);
}

export default function RootLayout() {
  useNotificationTaps();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // One retry: a flaky connection shouldn't be an error screen, but
            // a real failure shouldn't spin for long either.
            retry: 1,
            refetchOnReconnect: true,
          },
        },
      })
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" />
            <Stack.Screen name="book" />
            <Stack.Screen name="orders/[id]" options={{ headerShown: true, title: "Order" }} />
            <Stack.Screen
              name="orders/reschedule"
              options={{ headerShown: true, title: "Change pickup time", presentation: "modal" }}
            />
            <Stack.Screen name="account/privacy" options={{ headerShown: true, title: "Privacy and your data" }} />
            <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

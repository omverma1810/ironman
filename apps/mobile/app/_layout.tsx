import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../lib/auth";

export default function RootLayout() {
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
            <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

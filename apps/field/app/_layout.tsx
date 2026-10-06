import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth";
import { FieldProvider } from "../lib/offline/engine";
import { configureNotifications } from "../lib/push";

configureNotifications();

/** The offline engine belongs to a signed-in rider: it starts with them and
 * restarts, with their own queue, if the phone changes hands. */
function FieldGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  // Until the stored session is read nothing may render: a screen opened
  // straight from a link or a notification would otherwise start with no
  // rider and no offline engine.
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }
  if (!user) return <>{children}</>;
  return (
    <FieldProvider key={user.id} userId={user.id}>
      {children}
    </FieldProvider>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnReconnect: true } } })
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <FieldGate>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="login" />
              <Stack.Screen name="job/[id]" options={{ headerShown: true, title: "Job" }} />
            </Stack>
          </FieldGate>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

import { Redirect, Tabs } from "expo-router";
import { useEffect } from "react";
import { Shirt, UserRound } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { color } from "@ironman/tokens";
import { useAuth } from "../../lib/auth";
import { registerForPush } from "../../lib/push";

export default function TabsLayout() {
  const { user, isLoading } = useAuth();

  // A customer who already allowed notifications gets this phone's token
  // refreshed on every launch (tokens can change); nobody is prompted here.
  useEffect(() => {
    if (user) registerForPush({ askIfNeeded: false }).catch(() => undefined);
  }, [user]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (!user.full_name?.trim()) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: color.brand.ink,
        tabBarInactiveTintColor: "#6B7280",
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Orders",
          tabBarIcon: ({ color: tint, size }) => <Shirt color={tint} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color: tint, size }) => <UserRound color={tint} size={size} />,
        }}
      />
    </Tabs>
  );
}

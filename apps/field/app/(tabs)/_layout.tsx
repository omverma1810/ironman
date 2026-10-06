import { Redirect, Tabs } from "expo-router";
import { Banknote, ListChecks, UserRound } from "lucide-react-native";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { color } from "@ironman/tokens";
import { useAuth } from "../../lib/auth";
import { useField } from "../../lib/offline/engine";
import { registerForPush } from "../../lib/push";

export default function TabsLayout() {
  const { user, isLoading } = useAuth();

  // A rider who already allowed alerts gets this phone's token refreshed on
  // every launch; nobody is prompted here.
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
  return <SignedInTabs />;
}

function SignedInTabs() {
  const { pendingOps, pendingPhotos, issues } = useField();
  const waiting = pendingOps + pendingPhotos;
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: color.brand.ink,
        tabBarInactiveTintColor: "#4B5563",
        tabBarLabelStyle: { fontSize: 13, fontWeight: "600" },
        tabBarStyle: { minHeight: 64 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color: tint, size }) => <ListChecks color={tint} size={size} />,
        }}
      />
      <Tabs.Screen
        name="cash"
        options={{
          title: "Cash",
          tabBarIcon: ({ color: tint, size }) => <Banknote color={tint} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarBadge: issues.length ? issues.length : waiting ? waiting : undefined,
          tabBarIcon: ({ color: tint, size }) => <UserRound color={tint} size={size} />,
        }}
      />
    </Tabs>
  );
}

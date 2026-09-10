import { Redirect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  Text,
  View,
} from "react-native";
import { useAuth } from "../lib/auth";
import { formatMoneyMinor } from "../lib/format";
import { useMyOrders } from "../lib/orders";
import { statusColor, statusLabel } from "../lib/status";
import type { OrderListItem } from "../lib/types";

export default function HomeScreen() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();
  const ordersQuery = useMyOrders();

  if (authLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }
  if (!user) {
    return <Redirect href="/login" />;
  }

  const orders = ordersQuery.data?.results ?? [];

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-4 py-3">
        <View>
          <Text className="text-sm text-gray-500">Welcome back</Text>
          <Text className="font-bold text-xl text-brand-ink">{user.full_name || user.phone}</Text>
        </View>
        <Pressable onPress={logout}>
          <Text className="text-status-info text-sm font-medium">Log out</Text>
        </Pressable>
      </View>

      {ordersQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : orders.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-2 px-8">
          <Text className="text-lg font-semibold text-brand-ink">No orders yet</Text>
          <Text className="text-center text-sm text-gray-500">
            Once you book a pickup, it'll show up here so you can track it in real time.
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-3 px-4 py-2"
          refreshControl={
            <RefreshControl refreshing={ordersQuery.isFetching} onRefresh={ordersQuery.refetch} />
          }
          renderItem={({ item }) => <OrderCard order={item} onPress={() => router.push(`/orders/${item.id}`)} />}
        />
      )}
    </SafeAreaView>
  );
}

function OrderCard({ order, onPress }: { order: OrderListItem; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
    >
      <View className="gap-1">
        <Text className="font-semibold text-base text-brand-ink">{order.ref}</Text>
        <Text className="text-sm text-gray-500">
          {order.service_name} · {order.apartment_name || "No apartment on file"}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text className="text-sm font-medium" style={{ color: statusColor(order.status) }}>
          {statusLabel(order.status)}
        </Text>
        <Text className="text-sm text-gray-500">{formatMoneyMinor(order.total_minor)}</Text>
      </View>
    </Pressable>
  );
}

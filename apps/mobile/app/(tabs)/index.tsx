import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Banner, Button, Card, EmptyState, ErrorState, Loading } from "../../components/ui";
import { formatMoneyMinor } from "../../lib/format";
import { useMyOrders, usePendingRequotes, useRespondToRequote } from "../../lib/orders";
import { statusColor, statusLabel } from "../../lib/status";
import type { OrderListItem } from "../../lib/types";

export default function OrdersScreen() {
  const router = useRouter();
  const { restored } = useLocalSearchParams<{ restored?: string }>();
  const ordersQuery = useMyOrders();
  const requotesQuery = usePendingRequotes();
  const respondToRequote = useRespondToRequote();
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  const orders = ordersQuery.data?.results ?? [];
  const pendingRequotes = requotesQuery.data?.results ?? [];

  async function handleRespond(id: string, approved: boolean) {
    setRespondingId(id);
    setRespondError(null);
    try {
      await respondToRequote.mutateAsync({ id, approved });
    } catch {
      setRespondError("Couldn't send your answer. Please try again.");
    } finally {
      setRespondingId(null);
    }
  }

  const welcomeBack = restored ? (
    <View className="pb-3">
      <Banner tone="success">Welcome back. Your account is restored: nothing was deleted.</Banner>
    </View>
  ) : null;

  const requoteSection =
    pendingRequotes.length > 0 ? (
      <View className="gap-3 pb-3">
        <Text accessibilityRole="header" className="font-semibold text-base text-brand-ink">
          Needs your approval
        </Text>
        {pendingRequotes.map((requote) => (
          <Card key={requote.id} tone="warn">
            <Text className="text-sm text-brand-ink">
              <Text className="font-medium">{requote.order_ref}</Text>: {requote.reason}
            </Text>
            <Text className="text-sm text-gray-600">
              {formatMoneyMinor(requote.old_total_minor)} →{" "}
              <Text className="font-medium text-brand-ink">
                {formatMoneyMinor(requote.new_total_minor)}
              </Text>
            </Text>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  label="Approve new total"
                  disabled={respondingId === requote.id}
                  onPress={() => handleRespond(requote.id, true)}
                />
              </View>
              <View className="flex-1">
                <Button
                  label="Reject & cancel"
                  variant="secondary"
                  disabled={respondingId === requote.id}
                  onPress={() => handleRespond(requote.id, false)}
                />
              </View>
            </View>
          </Card>
        ))}
        {respondError ? <Text className="text-sm text-status-danger">{respondError}</Text> : null}
      </View>
    ) : null;

  const header = (
    <>
      {welcomeBack}
      {requoteSection}
    </>
  );

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["left", "right"]}>
      {ordersQuery.isLoading ? (
        <Loading label="Loading your orders" />
      ) : ordersQuery.isError ? (
        <ErrorState message="Couldn't load your orders." onRetry={() => ordersQuery.refetch()} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-3 px-4 pt-4 pb-6"
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              title="No orders yet"
              body="Book a pickup and it will show up here, so you can follow it from your door to the press and back."
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={ordersQuery.isRefetching}
              onRefresh={() => {
                ordersQuery.refetch();
                requotesQuery.refetch();
              }}
            />
          }
          renderItem={({ item }) => (
            <OrderCard order={item} onPress={() => router.push(`/orders/${item.id}`)} />
          )}
        />
      )}
      <View className="border-t border-gray-100 bg-white p-4">
        <Button label="Book a pickup" testID="book-pickup" onPress={() => router.push("/book")} />
      </View>
    </SafeAreaView>
  );
}

function OrderCard({ order, onPress }: { order: OrderListItem; onPress: () => void }) {
  const label = statusLabel(order.status);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.ref}, ${label}, ${formatMoneyMinor(order.total_minor)}`}
      onPress={onPress}
      className="min-h-16 flex-row items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
    >
      <View className="flex-1 gap-1">
        <Text className="font-semibold text-base text-brand-ink">{order.ref}</Text>
        <Text className="text-sm text-gray-600">
          {order.service_name} · {order.apartment_name || "No apartment on file"}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text className="font-medium text-sm" style={{ color: statusColor(order.status) }}>
          {label}
        </Text>
        <Text className="text-sm text-gray-600">{formatMoneyMinor(order.total_minor)}</Text>
      </View>
    </Pressable>
  );
}

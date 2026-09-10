import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { formatMoneyMinor } from "../../lib/format";
import { useOrder } from "../../lib/orders";
import { statusColor, statusLabel } from "../../lib/status";

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderQuery = useOrder(id);

  if (orderQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-8">
        <Text className="text-center text-base text-gray-500">
          Couldn't load this order. Pull down on the orders list to try again.
        </Text>
      </View>
    );
  }

  const order = orderQuery.data;

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="gap-6 p-4">
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="font-bold text-2xl text-brand-ink">{order.ref}</Text>
          <Text className="text-base font-semibold" style={{ color: statusColor(order.status) }}>
            {statusLabel(order.status)}
          </Text>
        </View>
        {order.address && <Text className="text-sm text-gray-500">{order.address}</Text>}
      </View>

      <View className="gap-3 rounded-lg border border-gray-200 p-4">
        <Text className="font-semibold text-base text-brand-ink">Garments</Text>
        {order.lines.map((line) => (
          <View key={line.id} className="flex-row items-center justify-between">
            <Text className="text-sm text-gray-700">
              {line.garment_type_name} × {line.verified_qty ?? line.declared_qty}
            </Text>
            <Text className="text-sm text-gray-700">{formatMoneyMinor(line.line_total_minor)}</Text>
          </View>
        ))}
        <View className="flex-row items-center justify-between border-t border-gray-100 pt-3">
          <Text className="font-semibold text-sm text-brand-ink">Total</Text>
          <Text className="font-semibold text-sm text-brand-ink">
            {formatMoneyMinor(order.total_minor)}
          </Text>
        </View>
      </View>

      {order.notes ? (
        <View className="gap-1">
          <Text className="font-semibold text-base text-brand-ink">Notes</Text>
          <Text className="text-sm text-gray-500">{order.notes}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

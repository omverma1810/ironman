import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { formatMoneyMinor } from "../../lib/format";
import { useOrder, useSubmitFeedback } from "../../lib/orders";
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

      {(order.status === "DELIVERED" || order.status === "CLOSED") && (
        <FeedbackSection orderId={order.id} alreadyRated={order.has_feedback} />
      )}
    </ScrollView>
  );
}

function FeedbackSection({
  orderId,
  alreadyRated,
}: {
  orderId: string;
  alreadyRated: boolean;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const submitFeedback = useSubmitFeedback();

  if (alreadyRated || submitted) {
    return (
      <View className="gap-1 rounded-lg border border-gray-200 p-4">
        <Text className="font-semibold text-base text-brand-ink">Thanks for rating this order</Text>
      </View>
    );
  }

  async function handleSubmit() {
    await submitFeedback.mutateAsync({ order: orderId, rating, comment: comment || undefined });
    setSubmitted(true);
  }

  return (
    <View className="gap-3 rounded-lg border border-gray-200 p-4">
      <Text className="font-semibold text-base text-brand-ink">Rate this order</Text>
      <View className="flex-row gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable key={value} onPress={() => setRating(value)} hitSlop={8}>
            <Text className={value <= rating ? "text-3xl text-brand-yellow" : "text-3xl text-gray-300"}>
              ★
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        placeholder="Comment (optional)"
        value={comment}
        onChangeText={setComment}
      />
      <Pressable
        className="items-center rounded-lg bg-brand-yellow py-2 disabled:opacity-50"
        disabled={rating === 0 || submitFeedback.isPending}
        onPress={handleSubmit}
      >
        <Text className="text-sm font-semibold text-brand-ink">Submit rating</Text>
      </Pressable>
    </View>
  );
}

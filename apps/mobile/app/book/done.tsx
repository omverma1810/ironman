import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { CircleCheck } from "lucide-react-native";
import { color } from "@ironman/tokens";
import { PushPrompt } from "../../components/push-prompt";
import { Button, Screen } from "../../components/ui";

export default function DoneStep() {
  const router = useRouter();
  const { id, ref } = useLocalSearchParams<{ id: string; ref: string }>();
  return (
    <Screen
      footer={
        <>
          <Button
            label="Track this order"
            testID="track-order"
            onPress={() => {
              // Back to the first screen, then on to the order: going back
              // from the order lands on the list, not on this booking.
              router.dismissTo("/");
              router.push(`/orders/${id}`);
            }}
          />
          <Button label="Back to my orders" variant="ghost" onPress={() => router.dismissTo("/")} />
        </>
      }
    >
      <View className="items-center gap-3 py-10">
        <CircleCheck size={56} color={color.status.success} />
        <Text accessibilityRole="header" className="font-bold text-2xl text-brand-ink">
          You're booked
        </Text>
        <Text testID="order-ref" className="font-semibold text-lg text-brand-ink">
          {ref}
        </Text>
        <Text className="text-center text-base text-gray-600">
          We'll text you when a rider is on the way. You can follow every step from the Orders tab.
        </Text>
      </View>
      <PushPrompt />
    </Screen>
  );
}

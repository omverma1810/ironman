import { useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useRef, useState } from "react";
import { View } from "react-native";
import { ApiError } from "../../lib/api";
import { Banner, Button, Card, Choice, Field, Hint, Row, Screen, SectionTitle } from "../../components/ui";
import { useBooking } from "../../lib/booking/context";
import { useCreateOrder, usePickupSlots, useQuote } from "../../lib/booking/hooks";
import {
  buildOrderInput,
  canPlaceOrder,
  describeAddress,
  HEARD_FROM,
  orderLines,
} from "../../lib/booking/state";
import { formatDay, formatMoneyMinor, formatWindow } from "../../lib/format";
import { useMyOrders } from "../../lib/orders";
import { saveServiceArea } from "../../lib/prefs";

export default function ConfirmStep() {
  const router = useRouter();
  const { state, dispatch } = useBooking();
  const orders = useMyOrders();
  const createOrder = useCreateOrder();
  const [error, setError] = useState<string | null>(null);
  // One key per booking attempt: if the connection drops after the order was
  // created and the customer taps again, the server returns the same order
  // instead of booking twice (docs/04 §3.4).
  const idempotencyKey = useRef<string | null>(null);

  const isFirstOrder = orders.isSuccess && orders.data.results.length === 0;
  const apartmentId =
    state.address?.kind === "new"
      ? state.address.apartment?.id
      : state.address?.kind === "saved"
        ? state.address.apartmentId
        : undefined;
  const lines = orderLines(state.counts);
  const quote = useQuote({
    hub: state.area?.hubId,
    service: state.serviceId,
    apartment: apartmentId,
    isFirstOrder,
    lines,
  });
  const cluster =
    (state.address?.kind === "new" ? state.address.apartment?.cluster : undefined) ?? state.area?.clusterId;
  const slots = usePickupSlots(cluster);
  const slot = state.slotId ? slots.data?.find((s) => s.id === state.slotId) : undefined;

  async function placeOrder() {
    setError(null);
    if (!idempotencyKey.current) idempotencyKey.current = randomUUID();
    try {
      const order = await createOrder.mutateAsync({
        input: buildOrderInput(state),
        idempotencyKey: idempotencyKey.current,
      });
      if (state.area) saveServiceArea(state.area);
      dispatch({ type: "reset" });
      router.replace({ pathname: "/book/done", params: { id: order.id, ref: order.ref } });
    } catch (err) {
      // A rejected booking (slot filled, bad code) is a new attempt once the
      // customer changes something; a lost connection must keep its key.
      if (ApiError.isApiError(err) && err.status >= 400 && err.status < 500) idempotencyKey.current = null;
      setError(
        ApiError.isApiError(err)
          ? err.fieldErrors.referral_code?.[0] ?? err.message
          : "Couldn't place your order. Check your connection and try again."
      );
    }
  }

  return (
    <Screen
      footer={
        <Button
          label={quote.data ? `Place order · ${formatMoneyMinor(quote.data.total.amount_minor)}` : "Place order"}
          testID="place-order"
          loading={createOrder.isPending}
          disabled={!canPlaceOrder(state)}
          onPress={placeOrder}
        />
      }
    >
      <Card>
        <SectionTitle>Pickup</SectionTitle>
        <Row left="Address" right={describeAddress(state.address)} />
        <Row
          left="Time"
          right={slot ? `${formatDay(slot.date)}, ${formatWindow(slot.window_start, slot.window_end)}` : "First available"}
        />
        {state.notes.trim() ? <Row left="Note" right={state.notes.trim()} /> : null}
      </Card>

      <Card>
        <SectionTitle>Items</SectionTitle>
        {quote.data?.lines.map((line) => (
          <Row
            key={line.garment_type}
            left={`${line.garment_type_name} × ${line.qty}`}
            right={formatMoneyMinor(line.line_total.amount_minor)}
          />
        ))}
        {quote.data && quote.data.discount.amount_minor > 0 ? (
          <Row left="Discount" right={`− ${formatMoneyMinor(quote.data.discount.amount_minor)}`} />
        ) : null}
        {quote.data ? <Row bold left="Estimated total" right={formatMoneyMinor(quote.data.total.amount_minor)} /> : null}
        <Hint>You pay after delivery. We confirm the final amount when we count your clothes.</Hint>
      </Card>

      {isFirstOrder ? (
        <View className="gap-4">
          <Field
            label="Referral code (optional)"
            testID="referral-input"
            autoCapitalize="characters"
            autoCorrect={false}
            value={state.referralCode}
            onChangeText={(code) => dispatch({ type: "referral", code })}
            hint="From a friend or your building's guard."
          />
          <View className="gap-2">
            <SectionTitle>How did you hear about us?</SectionTitle>
            {HEARD_FROM.map((option) => (
              <Choice
                key={option.value}
                title={option.label}
                selected={state.heardFrom === option.value}
                onPress={() =>
                  dispatch({ type: "heardFrom", value: state.heardFrom === option.value ? "" : option.value })
                }
              />
            ))}
          </View>
        </View>
      ) : null}

      {error ? <Banner tone="error">{error}</Banner> : null}
    </Screen>
  );
}

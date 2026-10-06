import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Text, TextInput, View, Pressable } from "react-native";
import { ApiError } from "../../lib/api";
import { EventList, StageProgress } from "../../components/order-progress";
import {
  Banner,
  Button,
  Card,
  Choice,
  ErrorState,
  Hint,
  Loading,
  Row,
  Screen,
  SectionTitle,
} from "../../components/ui";
import { formatDateTime, formatMoneyMinor, formatWindowRange } from "../../lib/format";
import {
  CANCEL_REASONS,
  canCancel,
  canRate,
  canReorder,
  canReschedule,
  isTroubled,
  troubleMessage,
} from "../../lib/order-rules";
import {
  useCancelOrder,
  useOrder,
  usePendingRequotes,
  useRespondToRequote,
  useSubmitFeedback,
  useTracking,
} from "../../lib/orders";
import { statusColor, statusLabel } from "../../lib/status";
import { visibleEvents } from "../../lib/timeline";
import type { OrderDetail } from "../../lib/types";

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderQuery = useOrder(id);
  const order = orderQuery.data;
  const tracking = useTracking(order?.tracking_token);

  if (orderQuery.isLoading) return <Loading label="Loading your order" />;
  if (orderQuery.isError || !order) {
    return (
      <ErrorState
        message="Couldn't load this order."
        onRetry={() => {
          orderQuery.refetch();
        }}
      />
    );
  }

  const events = visibleEvents(tracking.data?.events ?? []);

  return (
    <Screen>
      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <Text testID="order-detail-ref" accessibilityRole="header" className="font-bold text-2xl text-brand-ink">
            {order.ref}
          </Text>
          <Text testID="order-status" className="font-semibold text-base" style={{ color: statusColor(order.status) }}>
            {statusLabel(order.status)}
          </Text>
        </View>
        {order.address ? <Hint>{order.address}</Hint> : null}
      </View>

      <RequoteNotice orderId={order.id} />

      {isTroubled(order.status) ? (
        <Banner tone={order.status === "CANCELLED" ? "info" : "error"}>{troubleMessage(order.status)}</Banner>
      ) : (
        <Card>
          <SectionTitle>Progress</SectionTitle>
          <StageProgress stage={tracking.data?.stage ?? stageOf(order)} />
        </Card>
      )}

      <Card>
        <SectionTitle>Times</SectionTitle>
        <Row
          testID="pickup-time"
          left="Pickup"
          right={formatWindowRange(order.pickup_slot_start, order.pickup_slot_end)}
        />
        {order.delivery_slot_start ? (
          <Row left="Delivery" right={formatWindowRange(order.delivery_slot_start, order.delivery_slot_end)} />
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Items</SectionTitle>
        {order.lines.map((line) => (
          <Row
            key={line.id}
            left={`${line.garment_type_name} × ${line.verified_qty ?? line.declared_qty}${
              line.verified_qty == null ? " (est.)" : ""
            }`}
            right={formatMoneyMinor(line.line_total_minor)}
          />
        ))}
        <Row bold left="Total" right={formatMoneyMinor(order.total_minor)} />
        <Row left="Payment" right={order.payment_status.replaceAll("_", " ").toLowerCase()} />
        {tracking.data?.invoice?.pdf_url ? (
          <Button
            label={`View invoice ${tracking.data.invoice.ref}`}
            variant="secondary"
            onPress={() => Linking.openURL(tracking.data!.invoice!.pdf_url!)}
          />
        ) : null}
        {order.notes ? <Hint>Your note: {order.notes}</Hint> : null}
      </Card>

      {events.length > 0 ? (
        <Card>
          <SectionTitle>What's happened</SectionTitle>
          <EventList events={events} />
        </Card>
      ) : null}

      {canRate(order.status) ? <FeedbackSection orderId={order.id} alreadyRated={order.has_feedback} /> : null}

      <Actions order={order} />
    </Screen>
  );
}

/** The coarse stage the list payload implies, until the timeline loads. */
function stageOf(order: OrderDetail): string {
  switch (order.status) {
    case "PICKUP_ASSIGNED":
    case "PICKUP_EN_ROUTE":
      return "pickup";
    case "PICKED_UP":
    case "AT_HUB":
    case "INTAKE_VERIFIED":
    case "RETURNED_TO_HUB":
      return "atHub";
    case "IN_PRODUCTION":
      return "pressing";
    case "READY":
      return "ready";
    case "DELIVERY_ASSIGNED":
    case "OUT_FOR_DELIVERY":
      return "out";
    case "DELIVERED":
    case "CLOSED":
      return "delivered";
    default:
      return "booked";
  }
}

function RequoteNotice({ orderId }: { orderId: string }) {
  const requotes = usePendingRequotes();
  const respond = useRespondToRequote();
  const [error, setError] = useState<string | null>(null);
  const requote = requotes.data?.results.find((r) => r.order === orderId);
  if (!requote) return null;

  async function answer(approved: boolean) {
    setError(null);
    try {
      await respond.mutateAsync({ id: requote!.id, approved });
    } catch {
      setError("Couldn't send your answer. Please try again.");
    }
  }

  return (
    <Card tone="warn">
      <SectionTitle>Needs your approval</SectionTitle>
      <Text className="text-sm text-brand-ink">{requote.reason}</Text>
      <Text className="text-sm text-gray-700">
        {formatMoneyMinor(requote.old_total_minor)} → {formatMoneyMinor(requote.new_total_minor)}
      </Text>
      {error ? <Text className="text-sm text-status-danger">{error}</Text> : null}
      <Button label="Approve new total" loading={respond.isPending} onPress={() => answer(true)} />
      <Button label="Reject & cancel" variant="secondary" disabled={respond.isPending} onPress={() => answer(false)} />
    </Card>
  );
}

function Actions({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const showReschedule = canReschedule(order.status);
  const showCancel = canCancel(order.status);
  const showReorder = canReorder(order.status);
  if (!showReschedule && !showCancel && !showReorder) return null;

  if (cancelling) return <CancelPanel order={order} onClose={() => setCancelling(false)} />;

  return (
    <View className="gap-3">
      {showReorder ? (
        <Button
          label="Book these again"
          testID="reorder"
          onPress={() => router.push({ pathname: "/book", params: { reorder: order.id } })}
        />
      ) : null}
      {showReschedule ? (
        <Button
          label="Change pickup time"
          variant="secondary"
          testID="reschedule"
          onPress={() => router.push({ pathname: "/orders/reschedule", params: { id: order.id } })}
        />
      ) : null}
      {showCancel ? (
        <Button label="Cancel this order" variant="ghost" testID="cancel-order" onPress={() => setCancelling(true)} />
      ) : null}
    </View>
  );
}

function CancelPanel({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const cancel = useCancelOrder();
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await cancel.mutateAsync({ id: order.id, reason });
      onClose();
    } catch (err) {
      setError(ApiError.isApiError(err) ? err.message : "Couldn't cancel. Please try again.");
    }
  }

  return (
    <Card>
      <SectionTitle>Cancel {order.ref}?</SectionTitle>
      <Hint>Nothing is charged. Why are you cancelling?</Hint>
      {CANCEL_REASONS.map((option) => (
        <Choice key={option} title={option} selected={reason === option} onPress={() => setReason(option)} />
      ))}
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button label="Yes, cancel it" variant="danger" testID="confirm-cancel" loading={cancel.isPending} onPress={confirm} />
      <Button label="Keep my order" variant="secondary" onPress={onClose} />
    </Card>
  );
}

function FeedbackSection({ orderId, alreadyRated }: { orderId: string; alreadyRated: boolean }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitFeedback = useSubmitFeedback();

  if (alreadyRated || submitted) {
    return (
      <Card>
        <SectionTitle>Thanks for rating this order</SectionTitle>
      </Card>
    );
  }

  async function handleSubmit() {
    setError(null);
    try {
      await submitFeedback.mutateAsync({ order: orderId, rating, comment: comment.trim() || undefined });
      setSubmitted(true);
    } catch {
      setError("Couldn't send your rating. Please try again.");
    }
  }

  return (
    <Card>
      <SectionTitle>How did we do?</SectionTitle>
      <View accessibilityRole="radiogroup" className="flex-row gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={`${value} ${value === 1 ? "star" : "stars"}`}
            accessibilityState={{ selected: value === rating }}
            onPress={() => setRating(value)}
            className="size-12 items-center justify-center"
          >
            <Text className={value <= rating ? "text-4xl text-brand-yellow" : "text-4xl text-gray-300"}>★</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="Comment"
        className="min-h-12 rounded-lg border border-gray-300 px-4 py-3 text-base text-brand-ink"
        placeholder="Anything to add? (optional)"
        placeholderTextColor="#9CA3AF"
        value={comment}
        onChangeText={setComment}
      />
      {error ? <Text className="text-sm text-status-danger">{error}</Text> : null}
      <Button label="Send rating" loading={submitFeedback.isPending} disabled={rating === 0} onPress={handleSubmit} />
    </Card>
  );
}

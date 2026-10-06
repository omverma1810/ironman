import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Text, View } from "react-native";
import {
  Banner,
  Button,
  Card,
  Choice,
  ErrorState,
  Hint,
  Loading,
  QtyStepper,
  Row,
  Screen,
  SectionTitle,
} from "../../components/ui";
import { useBooking } from "../../lib/booking/context";
import { useGarmentTypes, useQuote, useServices } from "../../lib/booking/hooks";
import { MAX_PER_GARMENT, orderLines, totalQty } from "../../lib/booking/state";
import { formatMoneyMinor } from "../../lib/format";
import { useMyOrders } from "../../lib/orders";

export default function ItemsStep() {
  const router = useRouter();
  const { state, dispatch } = useBooking();
  const services = useServices();
  const garments = useGarmentTypes(state.serviceId);
  const orders = useMyOrders();

  // One service is the pilot's whole menu: don't ask a question with one answer.
  const onlyService = services.data?.length === 1 ? services.data[0] : null;
  useEffect(() => {
    if (onlyService && !state.serviceId) dispatch({ type: "service", serviceId: onlyService.id });
  }, [onlyService, state.serviceId, dispatch]);

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
    isFirstOrder: orders.isSuccess && orders.data.results.length === 0,
    lines,
  });
  const quantity = totalQty(state.counts);

  const footerLabel = quote.data
    ? `Continue · ${formatMoneyMinor(quote.data.total.amount_minor)}`
    : "Continue";

  return (
    <Screen
      footer={
        <>
          <Button
            label={footerLabel}
            testID="items-continue"
            disabled={quantity === 0 || quote.isError}
            onPress={() => router.push("/book/slot")}
          />
          {quantity > 0 ? (
            <Text className="text-center text-xs text-gray-600">
              {quantity} {quantity === 1 ? "item" : "items"}. The final price is confirmed when we count your clothes.
            </Text>
          ) : null}
        </>
      }
    >
      {services.isLoading ? <Loading label="Loading services" /> : null}
      {services.isError ? (
        <ErrorState message="Couldn't load our services." onRetry={() => services.refetch()} />
      ) : null}

      {services.data && services.data.length > 1 ? (
        <View className="gap-2">
          <SectionTitle>Service</SectionTitle>
          {services.data.map((service) => (
            <Choice
              key={service.id}
              title={service.name}
              subtitle={`Ready in about ${Math.round(service.sla_hours / 24) || 1} day(s)`}
              selected={state.serviceId === service.id}
              onPress={() => dispatch({ type: "service", serviceId: service.id })}
            />
          ))}
        </View>
      ) : null}

      {state.serviceId ? (
        <View className="gap-1">
          <SectionTitle>How many of each?</SectionTitle>
          {garments.isLoading ? <Loading label="Loading items" /> : null}
          {garments.isError ? (
            <ErrorState message="Couldn't load the item list." onRetry={() => garments.refetch()} />
          ) : null}
          {garments.data?.map((garment) => (
            <QtyStepper
              key={garment.id}
              label={garment.name}
              value={state.counts[garment.id] ?? 0}
              max={MAX_PER_GARMENT}
              onChange={(qty) => dispatch({ type: "count", garment: garment.id, qty })}
            />
          ))}
          {garments.data?.length === 0 ? <Hint>Nothing to choose here yet.</Hint> : null}
        </View>
      ) : null}

      {quantity > 0 ? (
        <Card>
          <SectionTitle>Estimate</SectionTitle>
          {quote.isError ? (
            <Banner tone="error">
              We couldn't price this right now. Check your connection and change a count to try again.
            </Banner>
          ) : quote.data ? (
            <View className="gap-2" testID="quote">
              {quote.data.lines.map((line) => (
                <Row
                  key={line.garment_type}
                  left={`${line.garment_type_name} × ${line.qty}`}
                  right={formatMoneyMinor(line.line_total.amount_minor)}
                />
              ))}
              {quote.data.discount.amount_minor > 0 ? (
                <Row left="Discount" right={`− ${formatMoneyMinor(quote.data.discount.amount_minor)}`} />
              ) : null}
              <Row bold left="Total" right={formatMoneyMinor(quote.data.total.amount_minor)} />
            </View>
          ) : (
            <Loading label="Working out the price" />
          )}
        </Card>
      ) : null}
    </Screen>
  );
}

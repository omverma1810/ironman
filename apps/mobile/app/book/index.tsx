import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  Banner,
  Button,
  Card,
  Choice,
  ErrorState,
  Field,
  Hint,
  Loading,
  Screen,
  SectionTitle,
} from "../../components/ui";
import { useBooking } from "../../lib/booking/context";
import { useApartmentSearch, useSavedAddresses, useServiceability } from "../../lib/booking/hooks";
import { addressReady, type AddressChoice } from "../../lib/booking/state";
import { saveServiceArea } from "../../lib/prefs";
import type { Address } from "../../lib/types";

type NewAddress = Extract<AddressChoice, { kind: "new" }>;

const emptyNewAddress: NewAddress = {
  kind: "new",
  mode: "apartment",
  apartment: null,
  flatNo: "",
  block: "",
  landmark: "",
  freeText: "",
};

function savedLabel(address: Address): string {
  const unit = [address.flat_no, address.block && `Block ${address.block}`].filter(Boolean).join(", ");
  return [unit, address.apartment_name || address.free_text_address].filter(Boolean).join(" · ") || address.label;
}

export default function AddressStep() {
  const router = useRouter();
  const { state, dispatch } = useBooking();
  const saved = useSavedAddresses();
  const [pincode, setPincode] = useState("");
  const [changingArea, setChangingArea] = useState(false);
  const area = changingArea ? null : state.area;

  // ── Where we pick up from ──────────────────────────────────────────────
  const serviceability = useServiceability(area ? "" : pincode);
  useEffect(() => {
    const result = serviceability.data;
    if (!result?.serviceable || !result.hub) return;
    const next = {
      pincode,
      hubId: result.hub.id,
      hubName: result.hub.name,
      clusterId: result.clusters[0]?.id ?? null,
    };
    dispatch({ type: "area", area: next });
    saveServiceArea(next);
    setChangingArea(false);
  }, [serviceability.data, pincode, dispatch]);

  // ── The address ────────────────────────────────────────────────────────
  const addresses = saved.data?.results ?? [];
  const choice = state.address;
  const newAddress: NewAddress = choice?.kind === "new" ? choice : emptyNewAddress;
  const [apartmentQuery, setApartmentQuery] = useState("");
  const apartments = useApartmentSearch(apartmentQuery, state.area?.clusterId ?? undefined);

  // With nothing saved the form is the only option, so start on it; with some,
  // start on the one used last so a repeat booking is a tap.
  useEffect(() => {
    if (!saved.isSuccess || choice) return;
    const last = addresses.find((a) => a.is_default) ?? addresses[0];
    dispatch({
      type: "address",
      address: last
        ? { kind: "saved", id: last.id, label: savedLabel(last), apartmentId: last.apartment }
        : emptyNewAddress,
    });
  }, [saved.isSuccess, addresses, choice, dispatch]);

  function update(patch: Partial<NewAddress>) {
    dispatch({ type: "address", address: { ...newAddress, ...patch } });
  }

  const ready = !!state.area && addressReady(choice);

  return (
    <Screen
      footer={
        <Button label="Continue" testID="address-continue" disabled={!ready} onPress={() => router.push("/book/items")} />
      }
    >
      <View className="gap-3">
        <SectionTitle>Where should we pick up?</SectionTitle>
        {area ? (
          <Card>
            <Text className="font-medium text-base text-brand-ink">{area.hubName}</Text>
            <Hint>Pincode {area.pincode}</Hint>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change pincode"
              onPress={() => {
                setPincode("");
                setChangingArea(true);
              }}
              className="min-h-12 justify-center"
            >
              <Text className="font-medium text-status-info">Change pincode</Text>
            </Pressable>
          </Card>
        ) : (
          <View className="gap-3">
            <Field
              label="Pincode"
              testID="pincode-input"
              keyboardType="number-pad"
              maxLength={6}
              placeholder="500027"
              value={pincode}
              onChangeText={(value) => setPincode(value.replace(/\D/g, ""))}
              hint="We'll check we pick up from your area."
            />
            {serviceability.isFetching ? <Loading label="Checking your area" /> : null}
            {serviceability.isError ? (
              <Banner tone="error">Couldn't check your area. Check your connection and try again.</Banner>
            ) : null}
            {serviceability.data && !serviceability.data.serviceable ? (
              <Banner tone="info">
                We don't pick up from {pincode} yet. We're adding areas as we grow.
              </Banner>
            ) : null}
          </View>
        )}
      </View>

      {state.area ? (
        <View className="gap-3">
          {saved.isLoading ? <Loading label="Loading your addresses" /> : null}
          {saved.isError ? (
            <ErrorState message="Couldn't load your saved addresses." onRetry={() => saved.refetch()} />
          ) : null}

          {addresses.length > 0 ? (
            <View className="gap-2">
              <SectionTitle>Your addresses</SectionTitle>
              {addresses.map((address) => (
                <Choice
                  key={address.id}
                  title={savedLabel(address)}
                  subtitle={address.is_default ? "Last used" : undefined}
                  selected={choice?.kind === "saved" && choice.id === address.id}
                  onPress={() =>
                    dispatch({
                      type: "address",
                      address: {
                        kind: "saved",
                        id: address.id,
                        label: savedLabel(address),
                        apartmentId: address.apartment,
                      },
                    })
                  }
                />
              ))}
              <Choice
                title="A different address"
                selected={choice?.kind === "new"}
                onPress={() => dispatch({ type: "address", address: newAddress })}
              />
            </View>
          ) : null}

          {choice?.kind === "new" ? (
            <View className="gap-4">
              {addresses.length === 0 ? <SectionTitle>Your address</SectionTitle> : null}
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button
                    label="My building is listed"
                    variant={newAddress.mode === "apartment" ? "primary" : "secondary"}
                    onPress={() => update({ mode: "apartment" })}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    label="Other address"
                    variant={newAddress.mode === "other" ? "primary" : "secondary"}
                    onPress={() => update({ mode: "other" })}
                  />
                </View>
              </View>

              {newAddress.mode === "apartment" ? (
                <View className="gap-3">
                  {newAddress.apartment ? (
                    <Card>
                      <Text className="font-medium text-base text-brand-ink">{newAddress.apartment.name}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Choose a different building"
                        onPress={() => update({ apartment: null })}
                        className="min-h-12 justify-center"
                      >
                        <Text className="font-medium text-status-info">Choose a different building</Text>
                      </Pressable>
                    </Card>
                  ) : (
                    <View className="gap-2">
                      <Field
                        label="Building or society"
                        testID="apartment-input"
                        placeholder="Start typing its name"
                        autoCapitalize="words"
                        value={apartmentQuery}
                        onChangeText={setApartmentQuery}
                      />
                      {apartments.isFetching ? <Loading label="Searching" /> : null}
                      {apartments.data?.map((apartment) => (
                        <Choice
                          key={apartment.id}
                          title={apartment.name}
                          selected={false}
                          onPress={() => update({ apartment })}
                        />
                      ))}
                      {apartments.data && apartments.data.length === 0 ? (
                        <Hint>No match. Try fewer letters, or use "Other address".</Hint>
                      ) : null}
                    </View>
                  )}
                  <Field
                    label="Flat number"
                    testID="flat-input"
                    placeholder="402"
                    autoCapitalize="characters"
                    value={newAddress.flatNo}
                    onChangeText={(flatNo) => update({ flatNo })}
                  />
                  <Field
                    label="Block or tower (if any)"
                    value={newAddress.block}
                    autoCapitalize="characters"
                    onChangeText={(block) => update({ block })}
                  />
                </View>
              ) : (
                <View className="gap-3">
                  <Field
                    label="Address"
                    testID="address-input"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    placeholder="House number, street, area"
                    value={newAddress.freeText}
                    onChangeText={(freeText) => update({ freeText })}
                  />
                  <Field
                    label="Landmark (optional)"
                    value={newAddress.landmark}
                    onChangeText={(landmark) => update({ landmark })}
                  />
                </View>
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

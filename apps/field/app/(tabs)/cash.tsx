import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Banner, Button, Card, Choice, ErrorState, Field, Hint, Loading, Row, SectionTitle } from "../../components/ui";
import { ApiError, api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { formatMoneyMinor, rupeesToMinor } from "../../lib/money";
import type { CashBalance, CashHandover, HandoverRecipient } from "../../lib/types";

/** Cash is the one thing that stays online-only: handing money to a person is
 * recorded when it happens, on both sides, never queued for later. */
export default function CashScreen() {
  const client = useQueryClient();
  const balance = useQuery({ queryKey: ["cash", "mine"], queryFn: () => api.get<CashBalance>("/billing/cash/mine") });
  const handovers = useQuery({
    queryKey: ["cash", "handovers"],
    queryFn: () => api.get<CashHandover[]>("/billing/cash/handovers/"),
  });
  const recipients = useQuery({
    queryKey: ["cash", "recipients"],
    queryFn: () => api.get<HandoverRecipient[]>("/billing/cash/handover-recipients"),
  });
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handover = useMutation({
    mutationFn: (input: { to_user: string; amount: number }) =>
      api.post<CashHandover>("/billing/cash/handovers/", input),
    onSuccess: () => {
      setAmount("");
      setDone(true);
      void client.invalidateQueries({ queryKey: ["cash"] });
    },
    onError: (err) =>
      setError(ApiError.isApiError(err) ? err.message : "Couldn't reach the server. Try again with a connection."),
  });

  const refreshing = balance.isRefetching || handovers.isRefetching;
  const refetch = () => {
    void balance.refetch();
    void handovers.refetch();
    void recipients.refetch();
  };

  if (balance.isPending) return <Loading label="Loading cash" />;
  if (balance.isError) {
    return <ErrorState message="Cash needs a connection. The rest of the app works without one." onRetry={refetch} />;
  }

  const minor = rupeesToMinor(amount);
  const pending = (handovers.data ?? []).filter((h) => h.status === "PENDING");

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="gap-4 p-4"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} />}
    >
      <Card>
        <Hint>Cash in your hands</Hint>
        <Text testID="cash-balance" className="font-bold text-3xl text-brand-ink">
          {formatMoneyMinor(balance.data.balance_minor)}
        </Text>
        {pending.length > 0 ? (
          <Hint>
            {formatMoneyMinor(pending.reduce((sum, h) => sum + h.declared_amount_minor, 0))} handed over,
            waiting for the hub to confirm.
          </Hint>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Hand cash to the hub</SectionTitle>
        {(recipients.data ?? []).map((r) => (
          <Choice
            key={r.id}
            title={r.full_name || r.email}
            selected={to === r.id}
            onPress={() => {
              setTo(r.id);
              setDone(false);
            }}
          />
        ))}
        <Field
          label="Amount (₹)"
          testID="handover-amount"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(t) => {
            setAmount(t);
            setError(null);
            setDone(false);
          }}
        />
        {error ? <Banner tone="error">{error}</Banner> : null}
        {done ? <Banner tone="success">Recorded. The hub will confirm what they received.</Banner> : null}
        <Button
          label="Hand over"
          testID="handover-submit"
          loading={handover.isPending}
          disabled={!to || !minor}
          onPress={() => {
            if (to && minor) handover.mutate({ to_user: to, amount: minor });
          }}
        />
      </Card>

      {(handovers.data ?? []).length > 0 ? (
        <Card>
          <SectionTitle>Recent handovers</SectionTitle>
          {(handovers.data ?? []).slice(0, 10).map((h) => (
            <View key={h.id} className="gap-0.5">
              <Row
                left={`${formatMoneyMinor(h.declared_amount_minor)} to ${h.to_user_name}`}
                right={h.status === "CONFIRMED" ? "Confirmed" : "Waiting"}
                bold
              />
              <Text className="text-sm text-gray-700">
                {formatDateTime(h.created_at)}
                {h.status === "CONFIRMED" && h.variance_minor !== 0
                  ? ` · difference ${formatMoneyMinor(h.variance_minor)}`
                  : ""}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

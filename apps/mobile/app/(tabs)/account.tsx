import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { Share, Switch, Text, View } from "react-native";
import { Banner, Button, Card, Field, Hint, Row, Screen, SectionTitle } from "../../components/ui";
import {
  CHANNEL_LABELS,
  referralMessage,
  useMyReferral,
  useNotificationPrefs,
  useSetNotificationPref,
} from "../../lib/account";
import { ApiError, useAuth } from "../../lib/auth";
import { formatMoneyMinor } from "../../lib/format";
import type { NotificationChannel } from "../../lib/types";

// Messages the app can honestly offer a choice about today.
const CHANNELS: NotificationChannel[] = ["WHATSAPP", "SMS"];

export default function AccountScreen() {
  const { logout } = useAuth();
  return (
    <Screen>
      <ProfileCard />
      <ReferralCard />
      <NotificationsCard />
      <Button label="Log out" variant="secondary" testID="log-out" onPress={logout} />
      <View className="items-center">
        <Text className="text-xs text-gray-500">
          IronMan {Constants.expoConfig?.version ?? ""}
        </Text>
      </View>
    </Screen>
  );
}

function ProfileCard() {
  const { user, updateName } = useAuth();
  const [name, setName] = useState(user?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => setName(user?.full_name ?? ""), [user?.full_name]);
  const changed = name.trim().length >= 2 && name.trim() !== (user?.full_name ?? "");

  async function save() {
    setMessage(null);
    setSaving(true);
    try {
      await updateName(name);
      setMessage({ tone: "success", text: "Saved." });
    } catch (err) {
      setMessage({
        tone: "error",
        text: ApiError.isApiError(err) ? err.message : "Couldn't save. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <SectionTitle>You</SectionTitle>
      <Field label="Name" testID="name-field" autoCapitalize="words" value={name} onChangeText={setName} />
      <Row left="Phone" right={user?.phone ?? "—"} />
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      {changed ? <Button label="Save name" testID="save-name" loading={saving} onPress={save} /> : null}
    </Card>
  );
}

function ReferralCard() {
  const referral = useMyReferral();
  const [copied, setCopied] = useState(false);
  if (!referral.data?.is_active) return null;
  const data = referral.data;

  async function copy() {
    await Clipboard.setStringAsync(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <SectionTitle>Refer a friend</SectionTitle>
      <Hint>
        {data.referrer_reward_minor > 0
          ? `Earn ${formatMoneyMinor(data.referrer_reward_minor)} when a friend's first order is delivered.`
          : "Share your code with friends and neighbours."}
      </Hint>
      <Text accessibilityLabel={`Your code is ${data.code}`} testID="referral-code" className="text-center font-bold text-3xl tracking-widest text-brand-ink">
        {data.code}
      </Text>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label={copied ? "Copied" : "Copy code"} variant="secondary" onPress={copy} />
        </View>
        <View className="flex-1">
          <Button label="Share" testID="share-referral" onPress={() => Share.share({ message: referralMessage(data) })} />
        </View>
      </View>
      <Row left="Friends who joined" right={String(data.friends_joined)} />
      <Row left="Your credit" right={formatMoneyMinor(data.credit_balance_minor)} />
    </Card>
  );
}

function NotificationsCard() {
  const prefs = useNotificationPrefs();
  const setPref = useSetNotificationPref();
  // No customer profile yet (nothing booked) means nothing to configure.
  if (!prefs.data) return null;
  const rows = prefs.data.filter((row) => CHANNELS.includes(row.channel));
  if (rows.length === 0) return null;

  return (
    <Card>
      <SectionTitle>Messages about your orders</SectionTitle>
      {rows.map((row) => (
        <View key={row.channel} className="min-h-12 flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-base text-brand-ink">{CHANNEL_LABELS[row.channel]}</Text>
          <Switch
            accessibilityLabel={CHANNEL_LABELS[row.channel]}
            value={row.opted_in}
            onValueChange={(opted_in) => setPref.mutate({ channel: row.channel, opted_in })}
          />
        </View>
      ))}
      <Hint>Pickup and delivery updates. We'll only message you about your orders.</Hint>
    </Card>
  );
}

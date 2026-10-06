import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, Text } from "react-native";
import { Issues, SyncStatus } from "../../components/sync";
import { Banner, Button, Card, Hint, Row, SectionTitle } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { useField } from "../../lib/offline/engine";
import { pushState, registerForPush, type PushState } from "../../lib/push";

export default function AccountScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { pendingOps, pendingPhotos, issues, fetchedAt } = useField();
  const [push, setPush] = useState<PushState>("unavailable");
  const waiting = pendingOps + pendingPhotos;

  useEffect(() => {
    pushState().then(setPush).catch(() => undefined);
  }, []);

  async function signOut() {
    await logout();
    router.replace("/login");
  }

  function confirmSignOut() {
    if (!waiting) return void signOut();
    const message = `${waiting} ${waiting === 1 ? "item hasn't" : "items haven't"} been sent yet. They stay on this phone and are sent the next time you sign in.`;
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(message)) void signOut();
      return;
    }
    Alert.alert("Sign out?", message, [
      { text: "Stay signed in", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="gap-4 p-4">
      <Card>
        <Text testID="rider-name" className="font-bold text-xl text-brand-ink">
          {user?.full_name || user?.email}
        </Text>
        <Hint>{user?.email}</Hint>
      </Card>

      <SyncStatus />
      <Issues issues={issues} />

      <Card>
        <SectionTitle>On this phone</SectionTitle>
        <Row left="Waiting to send" right={String(waiting)} />
        <Row left="Day last updated" right={formatDateTime(fetchedAt)} />
      </Card>

      {push === "ask" ? (
        <Card>
          <SectionTitle>Job alerts</SectionTitle>
          <Hint>Get a message when the office gives you new jobs.</Hint>
          <Button label="Turn on job alerts" onPress={() => registerForPush({ askIfNeeded: true }).then(setPush)} />
        </Card>
      ) : push === "denied" ? (
        <Banner tone="info">Job alerts are off. Turn them on for this app in the phone&apos;s Settings.</Banner>
      ) : push === "on" ? (
        <Banner tone="success">Job alerts are on.</Banner>
      ) : null}

      <Button label="Sign out" variant="secondary" testID="sign-out" onPress={confirmSignOut} />
      <Hint>IronMan Field {Constants.expoConfig?.version ?? ""}</Hint>
    </ScrollView>
  );
}

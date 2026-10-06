import { useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { Banner, Button, Card, Field, Hint, Loading, Screen, SectionTitle } from "../../components/ui";
import { ApiError, useAuth } from "../../lib/auth";
import { formatDay } from "../../lib/format";
import {
  deliverExport,
  useDeleteAccount,
  useDeletionCheck,
  useExportData,
  useSendDeletionCode,
  type DeletionScheduled,
} from "../../lib/privacy";

export default function PrivacyScreen() {
  return (
    <Screen>
      <ExportCard />
      <DeleteCard />
    </Screen>
  );
}

function ExportCard() {
  const exportData = useExportData();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    setDone(false);
    try {
      await deliverExport(await exportData.mutateAsync());
      setDone(true);
    } catch {
      setError("Couldn't prepare your data. Please try again.");
    }
  }

  return (
    <Card>
      <SectionTitle>Download my data</SectionTitle>
      <Hint>
        A file with everything we hold about you: your profile, addresses, consents, orders, invoices, payments, credit and
        feedback.
      </Hint>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {done ? <Banner tone="success">Your data is ready.</Banner> : null}
      <Button label="Download my data" testID="export-data" variant="secondary" loading={exportData.isPending} onPress={download} />
    </Card>
  );
}

function DeleteCard() {
  const check = useDeletionCheck();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <SectionTitle>Delete my account</SectionTitle>
      <Hint>
        We remove your name, phone number, flat number and delivery photos. Invoices and payments are kept without your name,
        because the law requires us to keep them for eight years.
      </Hint>
      {check.isLoading ? <Loading label="Checking your account" /> : null}
      {check.isError ? <Banner tone="info">We couldn't check your account right now. Please try again in a moment.</Banner> : null}
      {check.data && !check.data.can_delete ? (
        <Banner tone="info">
          Settle these first:{"\n"}
          {check.data.blockers.map((b) => `• ${b.message}`).join("\n")}
        </Banner>
      ) : null}
      {check.data?.can_delete && !open ? (
        <Button label="Delete my account" variant="danger" testID="start-delete" onPress={() => setOpen(true)} />
      ) : null}
      {check.data?.can_delete && open ? (
        <DeleteForm graceDays={check.data.grace_days} onCancel={() => setOpen(false)} />
      ) : null}
    </Card>
  );
}

function DeleteForm({ graceDays, onCancel }: { graceDays: number; onCancel: () => void }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const phone = user?.phone ?? "";
  const sendCode = useSendDeletionCode();
  const deleteAccount = useDeleteAccount();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<DeletionScheduled | null>(null);

  async function send() {
    setError(null);
    try {
      await sendCode.mutateAsync(phone);
      setCodeSent(true);
    } catch {
      setError("Couldn't send a code. Wait a minute and try again.");
    }
  }

  async function confirm() {
    setError(null);
    try {
      setScheduled(await deleteAccount.mutateAsync({ code: code.trim(), reason: reason.trim() || undefined }));
    } catch (err) {
      setError(ApiError.isApiError(err) ? err.message : "Couldn't delete your account. Please try again.");
    }
  }

  async function finish() {
    await logout();
    // Back to the first screen: with nobody signed in, the tabs send the
    // customer to the sign-in screen themselves. Replacing it from here as
    // well would leave two copies of the tabs under it.
    router.dismissAll();
  }

  if (scheduled) {
    return (
      <>
        <Banner tone="success">
          Your account is closed. Your details will be deleted on {formatDay(scheduled.scheduled_for.slice(0, 10))}. Changed
          your mind? Sign in again before then.
        </Banner>
        <Button label="Done" testID="deletion-done" onPress={finish} />
      </>
    );
  }

  return (
    <>
      <Banner tone="info">
        You'll be signed out at once. After {graceDays} days your details are deleted for good and can't be recovered.
      </Banner>
      <Field
        label="Why are you leaving? (optional)"
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        maxLength={500}
        value={reason}
        onChangeText={setReason}
      />
      {codeSent ? (
        <Field
          label={`6-digit code sent to ${phone}`}
          testID="delete-code"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChangeText={setCode}
        />
      ) : (
        <Text className="text-sm text-gray-600">To confirm it's you, we'll send a code to {phone}.</Text>
      )}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {codeSent ? (
        <Button
          label="Delete my account for good"
          variant="danger"
          testID="confirm-delete"
          loading={deleteAccount.isPending}
          disabled={code.trim().length < 4}
          onPress={confirm}
        />
      ) : (
        <Button label="Send me a code" testID="send-delete-code" loading={sendCode.isPending} onPress={send} />
      )}
      <Button label="Keep my account" variant="secondary" onPress={onCancel} />
    </>
  );
}

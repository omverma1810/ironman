import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { MapPin, Phone } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Linking, Text, View } from "react-native";
import { BagScanner, PhotoCapture, cameraAvailable } from "../../components/camera";
import { StatusChip, kindLabel } from "../../components/job-status";
import { Banner, Button, Card, Choice, EmptyState, Field, Hint, QtyStepper, Screen, SectionTitle } from "../../components/ui";
import { parseBagCode } from "../../lib/bags";
import { formatWindowRange } from "../../lib/format";
import { useAuth } from "../../lib/auth";
import { useField } from "../../lib/offline/engine";
import { isFinished } from "../../lib/offline/rules";
import type { JobCard } from "../../lib/types";

const FAIL_REASONS = [
  { code: "CUSTOMER_ABSENT", label: "Customer not available" },
  { code: "CUSTOMER_RESCHEDULED", label: "Customer asked to reschedule" },
  { code: "ACCESS_DENIED", label: "Couldn't get into the building or gate" },
  { code: "WRONG_ADDRESS", label: "Address problem" },
  { code: "VEHICLE_ISSUE", label: "Vehicle or route problem" },
  { code: "OTHER", label: "Something else" },
];

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

/** A job opened by a link while signed out goes to sign-in, not to a crash. */
export default function JobRoute() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  return <JobScreen />;
}

function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { jobs } = useField();
  const job = jobs.find((j) => j.id === id);
  if (!job) {
    return (
      <Screen>
        <EmptyState
          title="This job isn't on your list"
          body="It may have been reassigned. Pull down on Today to refresh."
        />
      </Screen>
    );
  }
  return <JobDetail job={job} />;
}

function JobDetail({ job }: { job: JobCard }) {
  const router = useRouter();
  const field = useField();
  const [reporting, setReporting] = useState(false);
  const delivery = job.kind === "DELIVERY";

  return (
    <Screen
      footer={
        job.status === "PENDING" ? (
          <Button
            label={`Start ${delivery ? "delivery" : "pickup"}`}
            testID="start-job"
            onPress={() => void field.start(job)}
          />
        ) : job.status === "EN_ROUTE" ? (
          <Button label="I've arrived" testID="arrive-job" onPress={() => void field.arrive(job)} />
        ) : null
      }
    >
      <View className="gap-2">
        <Text accessibilityRole="header" className="font-bold text-2xl text-brand-ink">
          {kindLabel(job.kind)} · {job.order_ref}
        </Text>
        <StatusChip status={job.status} />
        <Text className="text-base text-gray-800">{formatWindowRange(job.slot_start, job.slot_end)}</Text>
        {job.attempt_no > 1 ? <Hint>Attempt {job.attempt_no}</Hint> : null}
      </View>

      <Card>
        <Text testID="customer-name" className="font-semibold text-lg text-brand-ink">
          {job.customer_name}
        </Text>
        {job.address ? (
          <View className="flex-row items-start gap-2">
            <MapPin size={18} color="#4B5563" />
            <Text testID="job-address" className="flex-1 text-base text-brand-ink">
              {job.apartment_name && !job.address.includes(job.apartment_name)
                ? `${job.apartment_name} — `
                : ""}
              {job.address}
            </Text>
          </View>
        ) : (
          <Hint>No address on file. Call the customer.</Hint>
        )}
        {job.special_instructions ? (
          <Banner tone="info">{job.special_instructions}</Banner>
        ) : null}
        <View className="gap-2">
          {job.address ? (
            <Button
              label="Open in Maps"
              variant="secondary"
              onPress={() => void Linking.openURL(mapsUrl(job.address))}
            />
          ) : null}
          {job.customer_phone ? (
            <Button
              label={`Call ${job.customer_phone}`}
              variant="secondary"
              onPress={() => void Linking.openURL(`tel:${job.customer_phone}`)}
            />
          ) : null}
        </View>
      </Card>

      {job.lines.length > 0 ? (
        <Card>
          <SectionTitle>{delivery ? "In this order" : "Customer's estimate"}</SectionTitle>
          {job.lines.map((line) => (
            <Text key={line.garment_type} className="text-base text-brand-ink">
              {line.declared_qty} × {line.garment_type_name}
            </Text>
          ))}
        </Card>
      ) : null}

      {job.status === "ARRIVED" ? <Completion job={job} onDone={() => router.back()} /> : null}

      {job.status === "DONE" ? (
        <Banner tone="success">
          {delivery ? "Delivered." : "Picked up."} Thank you.
          {field.pendingOps + field.pendingPhotos > 0 ? " It will reach the office when you're back online." : ""}
        </Banner>
      ) : null}
      {job.status === "FAILED" ? (
        <Banner tone="error">Problem reported. The office will plan this job again.</Banner>
      ) : null}

      {!isFinished(job.status) ? (
        reporting ? (
          <Problem job={job} onCancel={() => setReporting(false)} onDone={() => router.back()} />
        ) : (
          <Button
            label="Report a problem"
            variant="secondary"
            testID="report-problem"
            onPress={() => setReporting(true)}
          />
        )
      ) : null}
    </Screen>
  );
}

function Completion({ job, onDone }: { job: JobCard; onDone: () => void }) {
  const field = useField();
  const delivery = job.kind === "DELIVERY";
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(job.lines.map((l) => [l.garment_type, l.declared_qty]))
  );
  const [codes, setCodes] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [photographing, setPhotographing] = useState(false);
  const [photos, setPhotos] = useState(0);
  const needed = Math.max(job.bag_count, 1);
  const ready = !delivery || codes.length >= needed;
  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  function addTyped() {
    const code = parseBagCode(typed);
    if (!code) {
      setTypedError("Bag codes look like BAG-1A2B3C4D5E.");
      return;
    }
    if (codes.includes(code)) {
      setTypedError(`${code} is already added.`);
      return;
    }
    setCodes((all) => [...all, code]);
    setTyped("");
    setTypedError(null);
  }

  return (
    <Card>
      <SectionTitle>{delivery ? "Hand over" : "Count what you collect"}</SectionTitle>

      {delivery ? (
        <View className="gap-3">
          <Text testID="bags-progress" className="text-base text-brand-ink">
            {codes.length} of {needed} {needed === 1 ? "bag" : "bags"} scanned
          </Text>
          {cameraAvailable ? (
            <Button label="Scan bags" testID="scan-bags" onPress={() => setScanning(true)} />
          ) : null}
          <Field
            label="Or type a bag code"
            testID="bag-input"
            autoCapitalize="characters"
            autoCorrect={false}
            value={typed}
            onChangeText={(text) => {
              setTyped(text);
              setTypedError(null);
            }}
            error={typedError}
            onSubmitEditing={addTyped}
          />
          <Button label="Add bag" variant="secondary" testID="add-bag" disabled={!typed.trim()} onPress={addTyped} />
          {codes.map((code) => (
            <Choice
              key={code}
              title={code}
              subtitle="Tap to remove"
              selected
              onPress={() => setCodes((all) => all.filter((c) => c !== code))}
            />
          ))}
          <BagScanner
            visible={scanning}
            scanned={codes}
            expected={needed}
            onCode={(code) => setCodes((all) => (all.includes(code) ? all : [...all, code]))}
            onClose={() => setScanning(false)}
          />
        </View>
      ) : (
        <View>
          <Hint>Change a number if you collect something different from the estimate.</Hint>
          {job.lines.map((line) => (
            <QtyStepper
              key={line.garment_type}
              label={line.garment_type_name}
              value={counts[line.garment_type] ?? 0}
              onChange={(n) => setCounts((c) => ({ ...c, [line.garment_type]: n }))}
            />
          ))}
          <Text testID="pickup-total" className="mt-1 font-semibold text-base text-brand-ink">
            {total} items
          </Text>
        </View>
      )}

      {cameraAvailable ? (
        <View className="gap-2">
          <Button
            label={photos ? `Photo taken (${photos}) · take another` : "Take a photo"}
            variant="secondary"
            onPress={() => setPhotographing(true)}
          />
          <PhotoCapture
            visible={photographing}
            onPhoto={(uri) => {
              void field.addPhoto(job, uri);
              setPhotos((n) => n + 1);
            }}
            onClose={() => setPhotographing(false)}
          />
        </View>
      ) : null}

      {!ready ? <Hint>Scan every bag before you complete the delivery.</Hint> : null}
      <Button
        label={delivery ? "Complete delivery" : "Complete pickup"}
        testID="complete-job"
        disabled={!ready}
        onPress={async () => {
          await field.complete(job, {
            declared_lines: delivery
              ? undefined
              : Object.entries(counts).map(([garment_type, qty]) => ({ garment_type, qty })),
            bag_codes: delivery ? codes : undefined,
          });
          onDone();
        }}
      />
    </Card>
  );
}

function Problem({
  job,
  onCancel,
  onDone,
}: {
  job: JobCard;
  onCancel: () => void;
  onDone: () => void;
}) {
  const field = useField();
  const [reason, setReason] = useState(FAIL_REASONS[0].code);
  const [note, setNote] = useState("");
  return (
    <Card tone="warn">
      <SectionTitle>What went wrong?</SectionTitle>
      {FAIL_REASONS.map((r) => (
        <Choice
          key={r.code}
          title={r.label}
          selected={reason === r.code}
          onPress={() => setReason(r.code)}
          testID={`reason-${r.code}`}
        />
      ))}
      <Field
        label="Note for the office (optional)"
        testID="problem-note"
        multiline
        value={note}
        onChangeText={setNote}
      />
      <Button
        label="Report problem"
        variant="danger"
        testID="confirm-problem"
        onPress={async () => {
          await field.fail(job, reason, note.trim());
          onDone();
        }}
      />
      <Button label="Back" variant="secondary" onPress={onCancel} />
    </Card>
  );
}

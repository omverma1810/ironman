import { Text, View } from "react-native";
import { formatDateTime } from "../lib/format";
import { useField } from "../lib/offline/engine";
import type { SyncIssue } from "../lib/types";
import { Banner, Button, Card } from "./ui";

/** One line that tells the rider whether what they did has reached the office. */
export function SyncStatus() {
  const { pendingOps, pendingPhotos, offline, syncing, fetchedAt, syncNow } = useField();
  const waiting = pendingOps + pendingPhotos;
  if (waiting === 0 && !offline) return null;
  const parts = [
    pendingOps ? `${pendingOps} ${pendingOps === 1 ? "action" : "actions"}` : "",
    pendingPhotos ? `${pendingPhotos} ${pendingPhotos === 1 ? "photo" : "photos"}` : "",
  ].filter(Boolean);
  return (
    <View testID="sync-status" className="gap-2">
      <Banner tone={offline ? "info" : "success"}>
        {offline ? "No connection. " : "Sending… "}
        {waiting
          ? `${parts.join(" and ")} saved on this phone and will be sent when you're back online.`
          : `Showing the day as of ${formatDateTime(fetchedAt)}.`}
      </Banner>
      {waiting > 0 ? (
        <Button
          label={syncing ? "Sending…" : "Send now"}
          variant="secondary"
          loading={syncing}
          testID="send-now"
          onPress={() => void syncNow()}
        />
      ) : null}
    </View>
  );
}

/** What the office refused, until the rider has read it. Never swallowed. */
export function Issues({ issues }: { issues: SyncIssue[] }) {
  const { dismissIssue } = useField();
  if (!issues.length) return null;
  return (
    <View testID="sync-issues" className="gap-3">
      {issues.map((issue) => (
        <Card key={issue.id} tone="warn">
          <Text className="font-semibold text-base text-brand-ink">
            {issue.what} didn&apos;t go through · {issue.order_ref}
          </Text>
          <Text className="text-base text-gray-800">{issue.message}</Text>
          <Text className="text-sm text-gray-700">
            The office has the latest on this job. Check its status on your list.
          </Text>
          <Button
            label="OK, got it"
            variant="secondary"
            testID={`dismiss-${issue.order_ref}`}
            onPress={() => void dismissIssue(issue.id)}
          />
        </Card>
      ))}
    </View>
  );
}

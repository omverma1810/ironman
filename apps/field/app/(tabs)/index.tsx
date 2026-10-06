import { useRouter } from "expo-router";
import { MapPin } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { StatusChip, kindLabel } from "../../components/job-status";
import { Issues, SyncStatus } from "../../components/sync";
import { Card, EmptyState, Loading, SectionTitle } from "../../components/ui";
import { formatDay, formatWindowRange } from "../../lib/format";
import { useField } from "../../lib/offline/engine";
import { splitDay, todayInIndia } from "../../lib/offline/rules";
import type { JobCard } from "../../lib/types";

function JobRow({ job, position }: { job: JobCard; position: number }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${kindLabel(job.kind)} ${job.order_ref}, ${job.customer_name}`}
      testID={`job-${job.order_ref}`}
      onPress={() => router.push(`/job/${job.id}`)}
      className="gap-2 rounded-lg border border-gray-300 bg-white p-4 active:bg-gray-50"
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-bold text-lg text-brand-ink">
          {position}. {kindLabel(job.kind)} · {job.order_ref}
        </Text>
        <StatusChip status={job.status} />
      </View>
      <Text className="text-base text-brand-ink">{job.customer_name}</Text>
      <Text className="text-sm text-gray-700">{formatWindowRange(job.slot_start, job.slot_end)}</Text>
      {job.address ? (
        <View className="flex-row items-start gap-1.5">
          <MapPin size={16} color="#4B5563" />
          <Text className="flex-1 text-sm text-gray-700" numberOfLines={2}>
            {job.address}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function TodayScreen() {
  const { ready, jobs, issues, syncing, syncNow, fetchedAt } = useField();
  const [showDone, setShowDone] = useState(false);
  const today = todayInIndia();
  const { todo, done } = useMemo(() => splitDay(jobs, today), [jobs, today]);

  if (!ready) return <Loading label="Loading your day" />;

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="gap-4 p-4"
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void syncNow()} />}
    >
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-bold text-2xl text-brand-ink">
          {formatDay(today)}
        </Text>
        <Text testID="day-summary" className="text-base text-gray-700">
          {todo.length} to do · {done.length} done
        </Text>
      </View>

      <SyncStatus />
      <Issues issues={issues} />

      {todo.length === 0 ? (
        <EmptyState
          title={fetchedAt ? "Nothing left to do" : "No jobs yet"}
          body={
            fetchedAt
              ? "New jobs appear here when the office assigns them. Pull down to check."
              : "Connect once to load your day. After that it works without signal."
          }
        />
      ) : (
        <View className="gap-3">
          {todo.map((job, i) => (
            <JobRow key={job.id} job={job} position={i + 1} />
          ))}
        </View>
      )}

      {done.length > 0 ? (
        <Card>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDone }}
            testID="toggle-done"
            onPress={() => setShowDone((v) => !v)}
          >
            <SectionTitle>
              {showDone ? "Hide" : "Show"} finished ({done.length})
            </SectionTitle>
          </Pressable>
          {showDone ? (
            <View className="gap-3">
              {done.map((job, i) => (
                <JobRow key={job.id} job={job} position={i + 1} />
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}

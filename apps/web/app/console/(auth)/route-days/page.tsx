"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { RouteDayBoard } from "@/components/fulfilment/route-day-board";
import { useClusters, useCreateRouteDay, useRouteDays } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RouteDaysPage() {
  const [clusterId, setClusterId] = useState("");
  const [date, setDate] = useState(todayIso());

  const clustersQuery = useClusters();
  const routeDaysQuery = useRouteDays({ cluster: clusterId, date });
  const createMutation = useCreateRouteDay();

  const routeDay = routeDaysQuery.data?.results[0];
  const clusters = clustersQuery.data?.results ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Route Days"
        description="Plan pickups and deliveries for a cluster and day, and watch them happen."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Cluster</Label>
          <Select value={clusterId} onValueChange={setClusterId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Choose a cluster" />
            </SelectTrigger>
            <SelectContent>
              {clusters.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="route-day-date">Date</Label>
          <Input
            id="route-day-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      {!clusterId ? (
        <EmptyState
          icon="truck"
          title="Pick a cluster"
          body="Choose a cluster above to see or plan its route day."
        />
      ) : routeDaysQuery.isPending ? (
        <Skeleton className="h-40" />
      ) : !routeDay ? (
        <EmptyState
          icon="truck"
          title="No route day yet"
          body={`Nothing planned for this cluster on ${formatDate(date)} yet.`}
          action={
            <Button
              onClick={() => createMutation.mutate({ cluster: clusterId, date })}
              loading={createMutation.isPending}
            >
              Create route day
            </Button>
          }
        />
      ) : (
        <RouteDayBoard routeDayId={routeDay.id} />
      )}
    </div>
  );
}

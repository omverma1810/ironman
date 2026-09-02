"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Icon } from "@/components/icons/icon";
import { useClusters, useCreateCluster, useHubs, useUpdateCluster } from "@/lib/api/hooks";
import type { Cluster } from "@/lib/api/types";

export function ClustersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const hubsQuery = useHubs();
  const clustersQuery = useClusters();
  const hubs = hubsQuery.data?.results ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clusters</DialogTitle>
          <DialogDescription>
            The grouping of apartments a route runs — pickups and deliveries are planned per
            cluster, per day.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {clustersQuery.data?.results.map((c) => (
            <ClusterRow key={c.id} cluster={c} />
          ))}
        </div>

        <Separator />

        <NewClusterForm defaultHub={hubs[0]?.id} />
      </DialogContent>
    </Dialog>
  );
}

function ClusterRow({ cluster }: { cluster: Cluster }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cluster.name);
  const update = useUpdateCluster();

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 flex-1"
          autoFocus
        />
        <Button
          size="sm"
          loading={update.isPending}
          onClick={() =>
            update.mutate(
              { id: cluster.id, patch: { name } },
              { onSuccess: () => setEditing(false) }
            )
          }
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-surface-sunken">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-primary">{cluster.name}</span>
        {!cluster.is_active && <Badge variant="neutral">Inactive</Badge>}
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            update.mutate({ id: cluster.id, patch: { is_active: !cluster.is_active } })
          }
        >
          {cluster.is_active ? "Deactivate" : "Activate"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Icon name="chevron-right" className="size-4" label="Edit" />
        </Button>
      </div>
    </div>
  );
}

function NewClusterForm({ defaultHub }: { defaultHub: string | undefined }) {
  const [name, setName] = useState("");
  const [hub, setHub] = useState(defaultHub ?? "");
  const hubsQuery = useHubs();
  const hubs = hubsQuery.data?.results ?? [];
  const create = useCreateCluster();

  function handleCreate() {
    if (!name.trim() || !hub) return;
    create.mutate(
      { hub, name: name.trim() },
      { onSuccess: () => setName("") }
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>New cluster</Label>
      <div className="flex items-center gap-2">
        {hubs.length > 1 && (
          <Select value={hub || hubs[0]?.id} onValueChange={setHub}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hubs.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          placeholder="Cluster name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1"
        />
        <Button
          size="sm"
          loading={create.isPending}
          disabled={!name.trim()}
          onClick={handleCreate}
        >
          <Icon name="plus" /> Add
        </Button>
      </div>
    </div>
  );
}

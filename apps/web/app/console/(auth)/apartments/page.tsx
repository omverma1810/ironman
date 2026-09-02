"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { ApartmentDialog } from "@/components/territory/apartment-dialog";
import { ClustersDialog } from "@/components/territory/clusters-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/icons/icon";
import { useApartments, useClusters } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";
import type { Apartment } from "@/lib/api/types";

export default function ApartmentsPage() {
  const [search, setSearch] = useState("");
  const [clusterFilter, setClusterFilter] = useState("all");
  const [clustersOpen, setClustersOpen] = useState(false);
  // An id, not a snapshot — a contact add/remove refetches the apartments
  // list, and a frozen row object would keep showing its stale contacts
  // until the dialog was closed and reopened.
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const clustersQuery = useClusters();
  const clusters = clustersQuery.data?.results ?? [];
  const apartmentsQuery = useApartments({
    cluster: clusterFilter === "all" ? undefined : clusterFilter,
  });
  const editingApartment =
    editingId && editingId !== "new"
      ? (apartmentsQuery.data?.results.find((a) => a.id === editingId) ?? null)
      : null;

  const rows = useMemo(() => {
    const results = apartmentsQuery.data?.results ?? [];
    if (!search.trim()) return results;
    const q = search.trim().toLowerCase();
    return results.filter(
      (a) => a.name.toLowerCase().includes(q) || a.pincode.includes(q)
    );
  }, [apartmentsQuery.data, search]);

  const columns: ColumnDef<Apartment, unknown>[] = [
    {
      accessorKey: "name",
      header: "Apartment",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.original.name}</span>
          <span className="text-xs text-text-muted">{row.original.pincode || "No pincode"}</span>
        </div>
      ),
    },
    {
      accessorKey: "cluster_name",
      header: "Cluster",
      cell: ({ row }) => <span className="text-text-secondary">{row.original.cluster_name}</span>,
    },
    {
      accessorKey: "contacts",
      header: "Contacts",
      cell: ({ row }) => (
        <span className="text-text-secondary tabular-nums">{row.original.contacts.length}</span>
      ),
    },
    {
      accessorKey: "launched_on",
      header: "Launched",
      cell: ({ row }) => (
        <span className="text-text-secondary">{formatDate(row.original.launched_on)}</span>
      ),
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="success" dot>
            Active
          </Badge>
        ) : (
          <Badge variant="neutral" dot>
            Inactive
          </Badge>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Apartments"
        description="Clusters, contacts and serviceability."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setClustersOpen(true)}>
              Manage clusters
            </Button>
            <Button size="sm" onClick={() => setEditingId("new")}>
              <Icon name="plus" /> New apartment
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          />
          <Input
            placeholder="Search by name or pincode…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={clusterFilter} onValueChange={setClusterFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clusters</SelectItem>
            {clusters.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AsyncBoundary
        query={apartmentsQuery}
        loading={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        }
        isEmpty={() => rows.length === 0}
        empty={
          <EmptyState
            icon="apartment"
            title={search || clusterFilter !== "all" ? "No apartments match" : "No apartments yet"}
            body={
              search || clusterFilter !== "all"
                ? "Try a different search term or clear the cluster filter."
                : "Add the apartments this hub serves to start booking their residents."
            }
            action={
              !search && clusterFilter === "all" ? (
                <Button size="sm" onClick={() => setEditingId("new")}>
                  <Icon name="plus" /> Add the first apartment
                </Button>
              ) : undefined
            }
          />
        }
      >
        {() => (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(row) => row.id}
            onRowClick={(row) => setEditingId(row.id)}
            mobileCard={(row) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{row.name}</p>
                    <p className="text-xs text-text-muted">{row.cluster_name}</p>
                  </div>
                  {row.is_active ? (
                    <Badge variant="success" dot>
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="neutral" dot>
                      Inactive
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-text-secondary">
                  <span>{row.contacts.length} contacts</span>
                  <span>{formatDate(row.launched_on)}</span>
                </div>
              </div>
            )}
          />
        )}
      </AsyncBoundary>

      <ApartmentDialog
        apartment={editingApartment}
        open={editingId !== null}
        onOpenChange={(open) => !open && setEditingId(null)}
      />
      <ClustersDialog open={clustersOpen} onOpenChange={setClustersOpen} />
    </div>
  );
}

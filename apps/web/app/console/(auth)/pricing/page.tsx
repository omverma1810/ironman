"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { MoneyText } from "@/components/patterns/money-text";
import { PageHeader } from "@/components/patterns/page-header";
import { PriceListDialog } from "@/components/catalog/price-list-dialog";
import { OfferDialog } from "@/components/catalog/offer-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/icons/icon";
import { useMe, useOffers, usePriceLists, useUpdateOffer } from "@/lib/api/hooks";
import { canEditPricing } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import type { Offer, PriceList } from "@/lib/api/types";

const OFFER_KIND_LABEL: Record<Offer["kind"], string> = {
  FIRST_ORDER: "First order",
  REFERRAL_CREDIT: "Referral credit",
  APARTMENT_PROMO: "Apartment promo",
  FLAT: "Flat",
  PERCENT: "Percent",
};

export default function PricingPage() {
  const me = useMe();
  const canEdit = canEditPricing(me.data?.roles);

  const [priceListDialog, setPriceListDialog] = useState<PriceList | "new" | null>(null);
  const [offerDialog, setOfferDialog] = useState<Offer | "new" | null>(null);

  const priceListsQuery = usePriceLists();
  const offersQuery = useOffers();
  const updateOffer = useUpdateOffer();

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Pricing" description="Effective-dated price lists and offers." />
        <EmptyState
          icon="lock"
          title="Founder-only"
          body="Price lists and offers are pricing configuration — visible to Founder accounts only, same tier as commission rules and unit economics."
        />
      </div>
    );
  }

  const priceListColumns: ColumnDef<PriceList, unknown>[] = [
    {
      accessorKey: "service_name",
      header: "Service",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.original.service_name}</span>
          <span className="text-xs text-text-muted">v{row.original.version}</span>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "ACTIVE" ? "success" : "neutral"} dot>
          {row.original.status.toLowerCase()}
        </Badge>
      ),
    },
    {
      accessorKey: "lines",
      header: "Garment types priced",
      cell: ({ row }) => <span className="text-text-secondary tabular-nums">{row.original.lines.length}</span>,
    },
    {
      accessorKey: "effective_from",
      header: "Effective from",
      cell: ({ row }) => (
        <span className="text-text-secondary">{formatDate(row.original.effective_from)}</span>
      ),
    },
  ];

  const offerColumns: ColumnDef<Offer, unknown>[] = [
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) => <span className="font-mono text-sm font-medium text-text-primary">{row.original.code}</span>,
    },
    {
      accessorKey: "kind",
      header: "Kind",
      cell: ({ row }) => <span className="text-text-secondary">{OFFER_KIND_LABEL[row.original.kind]}</span>,
    },
    {
      accessorKey: "value",
      header: "Value",
      cell: ({ row }) =>
        row.original.kind === "PERCENT" ? (
          <span className="text-text-secondary tabular-nums">{row.original.value_bps / 100}%</span>
        ) : (
          <MoneyText minor={row.original.value_minor} />
        ),
    },
    {
      accessorKey: "effective_from",
      header: "Window",
      cell: ({ row }) => (
        <span className="text-xs text-text-secondary">
          {formatDate(row.original.effective_from)}
          {row.original.effective_to ? ` – ${formatDate(row.original.effective_to)}` : " – ongoing"}
        </span>
      ),
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            updateOffer.mutate({ id: row.original.id, patch: { is_active: !row.original.is_active } });
          }}
        >
          <Badge variant={row.original.is_active ? "success" : "neutral"} dot>
            {row.original.is_active ? "Active" : "Inactive"}
          </Badge>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pricing" description="Effective-dated price lists and offers." />

      <Tabs defaultValue="price-lists">
        <TabsList>
          <TabsTrigger value="price-lists">Price lists</TabsTrigger>
          <TabsTrigger value="offers">Offers</TabsTrigger>
        </TabsList>

        <TabsContent value="price-lists" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setPriceListDialog("new")}>
              <Icon name="plus" /> New price list
            </Button>
          </div>
          <AsyncBoundary
            query={priceListsQuery}
            loading={<Skeleton className="h-48" />}
            isEmpty={() => (priceListsQuery.data?.results.length ?? 0) === 0}
            empty={
              <EmptyState
                icon="percent"
                title="No price lists yet"
                body="Create a draft price list, price each garment type, then activate it."
                action={
                  <Button size="sm" onClick={() => setPriceListDialog("new")}>
                    <Icon name="plus" /> New price list
                  </Button>
                }
              />
            }
          >
            {() => (
              <DataTable
                data={priceListsQuery.data?.results ?? []}
                columns={priceListColumns}
                getRowId={(row) => row.id}
                onRowClick={(row) => setPriceListDialog(row)}
                mobileCard={(row) => (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {row.service_name} v{row.version}
                      </p>
                      <p className="text-xs text-text-muted">{row.lines.length} garment types priced</p>
                    </div>
                    <Badge variant={row.status === "ACTIVE" ? "success" : "neutral"} dot>
                      {row.status.toLowerCase()}
                    </Badge>
                  </div>
                )}
              />
            )}
          </AsyncBoundary>
        </TabsContent>

        <TabsContent value="offers" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setOfferDialog("new")}>
              <Icon name="plus" /> New offer
            </Button>
          </div>
          <AsyncBoundary
            query={offersQuery}
            loading={<Skeleton className="h-48" />}
            isEmpty={() => (offersQuery.data?.results.length ?? 0) === 0}
            empty={
              <EmptyState
                icon="sparkles"
                title="No offers yet"
                body="First-order discounts, apartment promos and flat/percent offers all live here — dated and rule-based, never hardcoded."
                action={
                  <Button size="sm" onClick={() => setOfferDialog("new")}>
                    <Icon name="plus" /> New offer
                  </Button>
                }
              />
            }
          >
            {() => (
              <DataTable
                data={offersQuery.data?.results ?? []}
                columns={offerColumns}
                getRowId={(row) => row.id}
                onRowClick={(row) => setOfferDialog(row)}
                mobileCard={(row) => (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-medium text-text-primary">{row.code}</p>
                      <p className="text-xs text-text-muted">{OFFER_KIND_LABEL[row.kind]}</p>
                    </div>
                    <Badge variant={row.is_active ? "success" : "neutral"} dot>
                      {row.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                )}
              />
            )}
          </AsyncBoundary>
        </TabsContent>
      </Tabs>

      <PriceListDialog
        priceList={priceListDialog}
        open={priceListDialog !== null}
        onOpenChange={(open) => !open && setPriceListDialog(null)}
      />
      <OfferDialog
        offer={offerDialog === "new" ? null : offerDialog}
        open={offerDialog !== null}
        onOpenChange={(open) => !open && setOfferDialog(null)}
      />
    </div>
  );
}

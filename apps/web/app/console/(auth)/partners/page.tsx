"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PartnerDialog } from "@/components/partners/partner-dialog";
import { ReferralCodeDialog } from "@/components/partners/referral-code-dialog";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/icons/icon";
import {
  useMe,
  usePartners,
  useReferralCodes,
  useSetPartnerStatus,
  useSetReferralCodeActive,
} from "@/lib/api/hooks";
import { canManageGrowthPartners } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import type { ReferralCode, ReferralPartner } from "@/lib/api/types";

export default function PartnersPage() {
  const me = useMe();
  const canManage = canManageGrowthPartners(me.data?.roles);

  const [partnerDialog, setPartnerDialog] = useState<ReferralPartner | "new" | null>(null);
  const [codeDialogPartnerId, setCodeDialogPartnerId] = useState<string | "new" | null>(null);

  const partnersQuery = usePartners();
  const codesQuery = useReferralCodes();
  const setPartnerStatus = useSetPartnerStatus();
  const setCodeActive = useSetReferralCodeActive();

  const partners = partnersQuery.data?.results ?? [];
  const codes = codesQuery.data?.results ?? [];
  const activePartners = partners.filter((p) => p.status === "ACTIVE");

  if (!canManage) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Partners"
          description="Referral partners, watchmen, influencers and their codes."
        />
        <EmptyState
          icon="lock"
          title="Admin/Founder-only"
          body="Onboarding partners and issuing referral codes is config-and-correction territory, the same tier as pricing and commission rules — visible to Admin and Founder accounts only."
        />
      </div>
    );
  }

  const partnerColumns: ColumnDef<ReferralPartner, unknown>[] = [
    {
      accessorKey: "name",
      header: "Partner",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.original.name}</span>
          <span className="text-xs text-text-muted">{row.original.phone}</span>
        </div>
      ),
    },
    {
      accessorKey: "kind",
      header: "Kind",
      cell: ({ row }) => (
        <span className="text-text-secondary">{row.original.kind.toLowerCase()}</span>
      ),
    },
    {
      accessorKey: "apartment_name",
      header: "Apartment",
      cell: ({ row }) => (
        <span className="text-text-secondary">{row.original.apartment_name || "—"}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) =>
        row.original.status === "ACTIVE" ? (
          <Badge variant="success" dot>
            Active
          </Badge>
        ) : (
          <Badge variant="neutral" dot>
            Inactive
          </Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const partner = row.original;
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setCodeDialogPartnerId(partner.id);
              }}
            >
              <Icon name="link" /> Issue code
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setPartnerStatus.mutate({
                  id: partner.id,
                  status: partner.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                });
              }}
            >
              {partner.status === "ACTIVE" ? "Deactivate" : "Activate"}
            </Button>
          </div>
        );
      },
    },
  ];

  const codeColumns: ColumnDef<ReferralCode, unknown>[] = [
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium text-text-primary">
          {row.original.code}
        </span>
      ),
    },
    {
      accessorKey: "owner_partner_name",
      header: "Owner",
      cell: ({ row }) => (
        <span className="text-text-secondary">
          {row.original.owner_partner_name || row.original.owner_customer_name || "—"}
        </span>
      ),
    },
    {
      accessorKey: "apartment_name",
      header: "Apartment",
      cell: ({ row }) => (
        <span className="text-text-secondary">{row.original.apartment_name || "—"}</span>
      ),
    },
    {
      accessorKey: "uses_count",
      header: "Uses",
      cell: ({ row }) => (
        <span className="text-text-secondary tabular-nums">{row.original.uses_count}</span>
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
    {
      accessorKey: "created_at",
      header: "Issued",
      cell: ({ row }) => (
        <span className="text-text-secondary">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const code = row.original;
        return (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setCodeActive.mutate({ id: code.id, isActive: !code.is_active });
            }}
          >
            {code.is_active ? "Deactivate" : "Activate"}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Partners"
        description="Watchmen, influencers and other referral partners — and the codes they hand out."
      />

      <Tabs defaultValue="partners">
        <TabsList>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="codes">Referral codes</TabsTrigger>
        </TabsList>

        <TabsContent value="partners" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setPartnerDialog("new")}>
              <Icon name="plus" /> Onboard partner
            </Button>
          </div>

          <AsyncBoundary
            query={partnersQuery}
            loading={
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            }
            isEmpty={() => partners.length === 0}
            empty={
              <EmptyState
                icon="watchman"
                title="No referral partners yet"
                body="Onboard the watchmen and influencers who bring in orders so you can pay them from a statement instead of memory."
                action={
                  <Button size="sm" onClick={() => setPartnerDialog("new")}>
                    <Icon name="plus" /> Onboard the first partner
                  </Button>
                }
              />
            }
          >
            {() => (
              <DataTable
                data={partners}
                columns={partnerColumns}
                getRowId={(row) => row.id}
                onRowClick={(row) => setPartnerDialog(row)}
                mobileCard={(row) => (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{row.name}</p>
                        <p className="text-xs text-text-muted">{row.phone}</p>
                      </div>
                      {row.status === "ACTIVE" ? (
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
                      <span>{row.kind.toLowerCase()}</span>
                      <span>{row.apartment_name || "—"}</span>
                    </div>
                  </div>
                )}
              />
            )}
          </AsyncBoundary>
        </TabsContent>

        <TabsContent value="codes" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setCodeDialogPartnerId("new")}>
              <Icon name="plus" /> Issue code
            </Button>
          </div>

          <AsyncBoundary
            query={codesQuery}
            loading={
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            }
            isEmpty={() => codes.length === 0}
            empty={
              <EmptyState
                icon="link"
                title="No referral codes yet"
                body="Issue a human-sayable code for a partner to hand out — a watchman needs one they can read over a phone call."
                action={
                  activePartners.length > 0 ? (
                    <Button size="sm" onClick={() => setCodeDialogPartnerId("new")}>
                      <Icon name="plus" /> Issue the first code
                    </Button>
                  ) : undefined
                }
              />
            }
          >
            {() => (
              <DataTable
                data={codes}
                columns={codeColumns}
                getRowId={(row) => row.id}
                mobileCard={(row) => (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-mono text-sm font-medium text-text-primary">
                        {row.code}
                      </p>
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
                      <span>{row.owner_partner_name || row.owner_customer_name || "—"}</span>
                      <span>{row.uses_count} uses</span>
                    </div>
                  </div>
                )}
              />
            )}
          </AsyncBoundary>
        </TabsContent>
      </Tabs>

      <PartnerDialog
        partner={partnerDialog === "new" || partnerDialog === null ? null : partnerDialog}
        open={partnerDialog !== null}
        onOpenChange={(open) => !open && setPartnerDialog(null)}
      />
      <ReferralCodeDialog
        partners={activePartners}
        defaultPartnerId={
          codeDialogPartnerId && codeDialogPartnerId !== "new" ? codeDialogPartnerId : undefined
        }
        open={codeDialogPartnerId !== null}
        onOpenChange={(open) => !open && setCodeDialogPartnerId(null)}
      />
    </div>
  );
}

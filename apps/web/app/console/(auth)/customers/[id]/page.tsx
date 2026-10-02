"use client";

import { useParams, useRouter } from "next/navigation";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/icons/icon";
import { MoneyText } from "@/components/patterns/money-text";
import { CustomerCreditSection } from "@/components/billing/customer-credit-section";
import { useCustomer, useCustomerAttribution, useMe } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";
import { canIssueInvoices } from "@/lib/permissions";
import type { Role } from "@/lib/api/types";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const customerQuery = useCustomer(params.id);

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => router.push("/console/customers")}>
        <Icon name="arrow-left" /> Back to customers
      </Button>

      <AsyncBoundary
        query={customerQuery}
        loading={<Skeleton className="h-64" />}
      >
        {(customer) => (
          <>
            <PageHeader
              title={customer.name || customer.phone}
              description={customer.phone}
              actions={
                <a href={`tel:${customer.phone}`}>
                  <Button variant="secondary" size="sm">
                    <Icon name="phone" /> Call
                  </Button>
                </a>
              }
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBlock label="Status" value={<Badge className="capitalize">{customer.status.toLowerCase()}</Badge>} />
              <StatBlock label="Lifetime orders" value={String(customer.lifetime_orders)} />
              <StatBlock label="Lifetime spend" value={<MoneyText minor={customer.lifetime_gross_minor} />} />
              <StatBlock label="Last order" value={formatDate(customer.last_order_at)} />
            </div>

            <AcquiredVia customerId={customer.id} roles={me.data?.roles} />

            <CustomerCreditSection customerId={customer.id} roles={me.data?.roles} />

            <Card>
              <CardHeader>
                <CardTitle>Addresses</CardTitle>
              </CardHeader>
              <CardContent>
                {customer.addresses.length === 0 ? (
                  <EmptyState icon="map-pin" title="No addresses on file" />
                ) : (
                  <div className="flex flex-col gap-3">
                    {customer.addresses.map((addr) => (
                      <div key={addr.id} className="flex items-start gap-3 text-sm">
                        <Icon name="map-pin" className="mt-0.5 size-4 text-text-muted" />
                        <div>
                          <p className="text-text-primary">
                            {addr.label}
                            {addr.is_default && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                Default
                              </Badge>
                            )}
                          </p>
                          <p className="text-text-secondary">
                            {addr.flat_no ? `${addr.flat_no}, ` : ""}
                            {addr.apartment_name || addr.free_text_address}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                {customer.notes.length === 0 ? (
                  <p className="text-sm text-text-muted">No notes yet.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {customer.notes.map((note) => (
                      <div key={note.id} className="flex items-start gap-3 text-sm">
                        <Avatar name={note.author_name || "?"} size="sm" />
                        <div>
                          <p className="text-text-primary">{note.body}</p>
                          <p className="text-xs text-text-muted">{note.author_name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border-default bg-surface-raised p-4">
      <span className="text-xs font-medium tracking-wide text-text-muted uppercase">{label}</span>
      <span className="font-display text-lg font-semibold text-text-primary">{value}</span>
    </div>
  );
}

/** Where this customer came from (first touch). Quiet when unknown — a
 * customer from before attribution existed is backfilled, so the row is
 * normally there; ops roles only, same as the API. */
function AcquiredVia({ customerId, roles }: { customerId: string; roles: Role[] | undefined }) {
  const allowed = canIssueInvoices(roles); // Operator, Admin, Founder
  const attribution = useCustomerAttribution(allowed ? customerId : undefined);
  const a = attribution.data;
  if (!allowed || !a) return null;
  return (
    <p className="text-sm text-text-secondary" data-testid="acquired-via">
      Acquired via <span className="font-medium text-text-primary">{a.channel_name}</span>
      {a.partner_name && <> · {a.partner_name}</>}
      {a.code && <> (code {a.code})</>}
      {a.basis === "DEFAULT" && <span className="text-text-muted"> — source unknown</span>}
    </p>
  );
}

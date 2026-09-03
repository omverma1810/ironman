"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { CreditNoteDialog } from "@/components/billing/invoice-section";
import { MoneyText } from "@/components/patterns/money-text";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/icons/icon";
import { useInvoice } from "@/lib/api/hooks";
import { resolveMediaUrl } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";

export default function InvoiceDetailPage() {
  const params = useParams<{ ref: string }>();
  const router = useRouter();
  const invoiceQuery = useInvoice(params.ref);
  const [creditOpen, setCreditOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => router.push("/console/invoices")}>
        <Icon name="arrow-left" /> Back to invoices
      </Button>

      <AsyncBoundary query={invoiceQuery} loading={<Skeleton className="h-96" />}>
        {(invoice) => (
          <>
            <PageHeader
              title={invoice.ref}
              description={`${invoice.customer_name} · ${invoice.order_ref}`}
              actions={
                <div className="flex items-center gap-2">
                  <Badge variant={invoice.status === "PAID" ? "success" : "info"}>
                    {invoice.status.toLowerCase()}
                  </Badge>
                  {invoice.pdf_url && (
                    <a href={resolveMediaUrl(invoice.pdf_url) ?? undefined} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm">
                        <Icon name="download" /> Download PDF
                      </Button>
                    </a>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setCreditOpen(true)}>
                    Issue credit note
                  </Button>
                </div>
              }
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="flex flex-col gap-4 lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Items</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {invoice.snapshot.map((line, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-text-primary">{line.garment_type_name}</span>
                          <span className="text-text-muted">× {line.qty}</span>
                        </div>
                        <MoneyText minor={line.line_total_minor} />
                      </div>
                    ))}
                    <Separator />
                    <div className="flex items-center justify-between text-sm text-text-secondary">
                      <span>Subtotal</span>
                      <MoneyText minor={invoice.subtotal_minor} />
                    </div>
                    {invoice.discount_minor > 0 && (
                      <div className="flex items-center justify-between text-sm text-status-success">
                        <span>Discount</span>
                        <span>
                          −<MoneyText minor={invoice.discount_minor} />
                        </span>
                      </div>
                    )}
                    {invoice.gst_applied && (
                      <div className="flex items-center justify-between text-sm text-text-secondary">
                        <span>GST{invoice.gstin_snapshot && ` (${invoice.gstin_snapshot})`}</span>
                        <MoneyText minor={invoice.tax_minor} />
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm font-semibold text-text-primary">
                      <span>Total</span>
                      <MoneyText minor={invoice.total_minor} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Credit notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {invoice.credit_notes.length === 0 ? (
                      <p className="text-sm text-text-muted">No credit notes issued.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {invoice.credit_notes.map((cn) => (
                          <div key={cn.id} className="flex flex-col gap-1 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-text-primary">{cn.reason}</span>
                              <MoneyText minor={cn.amount_minor} />
                            </div>
                            <span className="text-xs text-text-muted">
                              {formatDateTime(cn.at)}
                              {cn.issued_by_name && ` · ${cn.issued_by_name}`}
                            </span>
                          </div>
                        ))}
                        <Separator />
                        <div className="flex items-center justify-between text-sm font-medium text-text-primary">
                          <span>Net after credits</span>
                          <MoneyText minor={invoice.total_minor - invoice.credited_minor} />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-col gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Details</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    <DetailRow label="Hub">{invoice.hub_name}</DetailRow>
                    <DetailRow label="Customer phone">{invoice.customer_phone}</DetailRow>
                    <DetailRow label="Issued">
                      {invoice.issued_at ? formatDateTime(invoice.issued_at) : "—"}
                    </DetailRow>
                  </CardContent>
                </Card>
              </div>
            </div>

            <CreditNoteDialog invoiceRef={invoice.ref} open={creditOpen} onOpenChange={setCreditOpen} />
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary">{children}</span>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addressesApi, authApi, billingApi, ordersApi, requotesApi } from "@/lib/api/endpoints";
import { resolveMediaUrl } from "@/lib/api/client";
import { formatDate, formatMoneyMinor } from "@/lib/format";
import { useCustomerAuth } from "@/lib/customer-auth";
import type { Address, AddressInput, OrderListItem } from "@/lib/api/types";

export default function AccountPage() {
  const auth = useCustomerAuth();

  if (auth.isLoading) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-12">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="iron" className="size-5 text-brand-yellow" />
          <span className="font-display text-sm font-semibold text-text-primary">IronMan</span>
        </div>
        {auth.user && (
          <Button variant="ghost" size="sm" onClick={auth.logout}>
            Log out
          </Button>
        )}
      </div>

      {!auth.user ? <LoginForm /> : <Dashboard />}
    </div>
  );
}

function LoginForm() {
  const auth = useCustomerAuth();
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  function normalizedPhone(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    return raw.startsWith("+") ? `+${digits}` : `+91${digits}`;
  }

  async function handleSend() {
    setSending(true);
    try {
      await auth.requestOtp(normalizedPhone(phone));
      setOtpSent(true);
    } catch {
      toast.error("Couldn't send a verification code.");
    } finally {
      setSending(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      await auth.verifyOtp(normalizedPhone(phone), code, fullName || undefined);
    } catch {
      toast.error("That code is incorrect or has expired.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to your account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          inputMode="tel"
          placeholder="98765 43210"
          value={phone}
          disabled={otpSent}
          onChange={(e) => setPhone(e.target.value)}
        />
        {!otpSent ? (
          <Button onClick={handleSend} disabled={phone.trim().length < 8 || sending}>
            Send code
          </Button>
        ) : (
          <>
            <Label htmlFor="full_name">Your name</Label>
            <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Label htmlFor="code">6-digit code</Label>
            <Input
              id="code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <Button onClick={handleVerify} disabled={code.length !== 6 || verifying}>
              Verify &amp; sign in
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const auth = useCustomerAuth();
  return (
    <Tabs defaultValue="orders">
      <TabsList>
        <TabsTrigger value="orders">Orders</TabsTrigger>
        <TabsTrigger value="addresses">Addresses</TabsTrigger>
        <TabsTrigger value="profile">Profile</TabsTrigger>
      </TabsList>
      <TabsContent value="orders">
        <OrdersTab accessToken={auth.accessToken as string} />
      </TabsContent>
      <TabsContent value="addresses">
        <AddressesTab accessToken={auth.accessToken as string} />
      </TabsContent>
      <TabsContent value="profile">
        <ProfileTab />
      </TabsContent>
    </Tabs>
  );
}

function ProfileTab() {
  const auth = useCustomerAuth();
  const [fullName, setFullName] = useState(auth.user?.full_name ?? "");
  const mutation = useMutation({
    mutationFn: () => authApi.updateMe({ full_name: fullName }, auth.accessToken as string),
    onSuccess: () => {
      toast.success("Profile updated");
      auth.refreshMe();
    },
    onError: () => toast.error("Couldn't update your profile."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Phone</Label>
          <p className="text-sm text-text-secondary">{auth.user?.phone}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile_name">Name</Label>
          <Input id="profile_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <Button
          className="self-start"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !fullName.trim()}
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function AddressesTab({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();
  const addresses = useQuery({
    queryKey: ["my-addresses"],
    queryFn: () => addressesApi.mine(accessToken),
  });

  const [flatNo, setFlatNo] = useState("");
  const [block, setBlock] = useState("");
  const [landmark, setLandmark] = useState("");
  const [freeTextAddress, setFreeTextAddress] = useState("");
  const [label, setLabel] = useState("Home");

  const createMutation = useMutation({
    mutationFn: (input: AddressInput) => addressesApi.create(input, accessToken),
    onSuccess: () => {
      toast.success("Address saved");
      setFlatNo("");
      setBlock("");
      setLandmark("");
      setFreeTextAddress("");
      queryClient.invalidateQueries({ queryKey: ["my-addresses"] });
    },
    onError: () => toast.error("Couldn't save that address."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => addressesApi.delete(id, accessToken),
    onSuccess: () => {
      toast.success("Address removed");
      queryClient.invalidateQueries({ queryKey: ["my-addresses"] });
    },
    onError: () => toast.error("Couldn't remove that address."),
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Saved addresses</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {addresses.isPending && <Skeleton className="h-16 w-full" />}
          {addresses.data?.results.length === 0 && (
            <p className="text-sm text-text-muted">No saved addresses yet.</p>
          )}
          {addresses.data?.results.map((a: Address) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-md border border-border-default px-3 py-2 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium text-text-primary">{a.label}</span>
                <span className="text-text-muted">
                  {a.apartment_name && `${a.apartment_name}, `}
                  {a.flat_no && `Flat ${a.flat_no}`}
                  {a.block && `, Block ${a.block}`}
                  {a.free_text_address}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${a.label}`}
                onClick={() => deleteMutation.mutate(a.id)}
              >
                <Icon name="close" className="size-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add an address</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addr_label">Label</Label>
              <Input id="addr_label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addr_flat_no">Flat no.</Label>
              <Input id="addr_flat_no" value={flatNo} onChange={(e) => setFlatNo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addr_block">Block (optional)</Label>
            <Input id="addr_block" value={block} onChange={(e) => setBlock(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addr_free_text">Full address</Label>
            <Input
              id="addr_free_text"
              value={freeTextAddress}
              onChange={(e) => setFreeTextAddress(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addr_landmark">Landmark (optional)</Label>
            <Input
              id="addr_landmark"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
            />
          </div>
          <Button
            className="self-start"
            disabled={
              (!flatNo.trim() && !freeTextAddress.trim()) || createMutation.isPending
            }
            onClick={() =>
              createMutation.mutate({
                flat_no: flatNo,
                block,
                landmark,
                free_text_address: freeTextAddress,
                label,
              })
            }
          >
            Save address
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function OrdersTab({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();
  const orders = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => ordersApi.list(undefined, accessToken),
  });
  const addresses = useQuery({
    queryKey: ["my-addresses"],
    queryFn: () => addressesApi.mine(accessToken),
  });
  const pendingRequotes = useQuery({
    queryKey: ["my-requotes"],
    queryFn: () => requotesApi.list({ decision: "PENDING" }, accessToken),
  });
  const respondMutation = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      requotesApi.respond(id, approved, accessToken),
    onSuccess: (order, { approved }) => {
      toast.success(
        approved ? `${order.ref} approved at the new total` : `${order.ref} cancelled`
      );
      queryClient.invalidateQueries({ queryKey: ["my-requotes"] });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    },
    onError: () => toast.error("Couldn't record your decision."),
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleTrack(order: OrderListItem) {
    setBusyId(order.id);
    try {
      const detail = await ordersApi.get(order.id, accessToken);
      window.location.href = `/track/${detail.tracking_token}`;
    } catch {
      toast.error("Couldn't open tracking for that order.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleInvoice(order: OrderListItem) {
    setBusyId(order.id);
    try {
      const invoices = await billingApi.invoices({ order: order.id }, accessToken);
      const invoice = invoices.results[0];
      if (!invoice) {
        toast.info("No invoice has been issued for this order yet.");
        return;
      }
      const pdf = await billingApi.invoicePdfUrl(invoice.ref, accessToken);
      const url = resolveMediaUrl(pdf.url);
      if (url) window.open(url, "_blank", "noreferrer");
      else toast.info("The invoice PDF isn't ready yet.");
    } catch {
      toast.error("Couldn't fetch the invoice.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReorder(order: OrderListItem) {
    setBusyId(order.id);
    try {
      const detail = await ordersApi.get(order.id, accessToken);
      const matchingAddress = addresses.data?.results.find(
        (a) => detail.apartment && a.apartment === detail.apartment
      );
      const created = await ordersApi.create(
        {
          hub: detail.hub,
          service: detail.service,
          apartment: detail.apartment ?? undefined,
          address: matchingAddress?.id,
          channel: "WEB",
          lines: detail.lines.map((line) => ({
            garment_type: line.garment_type,
            qty: line.declared_qty,
          })),
        },
        { accessToken }
      );
      toast.success(`Order ${created.ref} placed`);
      window.location.href = `/track/${created.tracking_token}`;
    } catch {
      toast.error("Couldn't repeat that order.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!!pendingRequotes.data?.results.length && (
        <Card>
          <CardHeader>
            <CardTitle>Needs your approval</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pendingRequotes.data.results.map((requote, i) => (
              <div key={requote.id} className="flex flex-col gap-2">
                {i > 0 && <Separator />}
                <p className="text-sm text-text-primary">
                  <span className="font-medium">{requote.order_ref}</span>: {requote.reason}
                </p>
                <p className="text-sm text-text-muted">
                  {formatMoneyMinor(requote.old_total_minor)} →{" "}
                  <span className="font-medium text-text-primary">
                    {formatMoneyMinor(requote.new_total_minor)}
                  </span>
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={respondMutation.isPending}
                    onClick={() => respondMutation.mutate({ id: requote.id, approved: true })}
                  >
                    Approve new total
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={respondMutation.isPending}
                    onClick={() => respondMutation.mutate({ id: requote.id, approved: false })}
                  >
                    Reject &amp; cancel order
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Order history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {orders.isPending && <Skeleton className="h-32 w-full" />}
        {orders.data?.results.length === 0 && (
          <p className="text-sm text-text-muted">No orders yet.</p>
        )}
        {orders.data?.results.map((order, i) => (
          <div key={order.id} className="flex flex-col gap-2">
            {i > 0 && <Separator />}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="flex flex-col">
                <span className="font-medium text-text-primary">{order.ref}</span>
                <span className="text-text-muted">
                  {order.service_name} · {formatDate(order.created_at)} ·{" "}
                  {formatMoneyMinor(order.total_minor)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === order.id}
                  onClick={() => handleTrack(order)}
                >
                  Track
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === order.id}
                  onClick={() => handleInvoice(order)}
                >
                  Invoice
                </Button>
                <Button
                  size="sm"
                  disabled={busyId === order.id}
                  onClick={() => handleReorder(order)}
                >
                  Reorder
                </Button>
              </div>
            </div>
          </div>
        ))}
        </CardContent>
      </Card>
    </div>
  );
}

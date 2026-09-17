"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { newIdempotencyKey } from "@/lib/api/client";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import {
  useApartmentSearch,
  useCapacitySlots,
  useCreateOrder,
  useGarmentTypes,
  useQuoteMutation,
  useRequestOtp,
  useServiceability,
  useServices,
  useVerifyOtp,
} from "@/lib/api/hooks";
import type { Channel, OrderDetail, PublicApartment } from "@/lib/api/types";

const STEPS = ["Location", "Address", "Service", "Items", "Slot", "Verify", "Confirm"] as const;

export default function BookPage() {
  const [step, setStep] = useState(0);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  // `?src=whatsapp` (docs/08 batch 4.8): a customer who tapped a WhatsApp
  // template's deep link back to this page still books through the same
  // wizard — only the recorded channel differs, for attribution.
  const [channel] = useState<Channel>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("src") === "whatsapp"
      ? "WHATSAPP"
      : "WEB"
  );

  // ── Step 0: pincode / serviceability ──────────────────────────────────
  const [pincode, setPincode] = useState("");
  const serviceability = useServiceability(pincode);
  const hub = serviceability.data?.serviceable ? serviceability.data.hub : null;
  const clusters = serviceability.data?.clusters ?? [];

  // ── Step 1: address ────────────────────────────────────────────────────
  const [addressMode, setAddressMode] = useState<"apartment" | "manual">("apartment");
  const [apartmentQuery, setApartmentQuery] = useState("");
  const apartmentResults = useApartmentSearch(apartmentQuery);
  const [apartment, setApartment] = useState<PublicApartment | null>(null);
  const [flatNo, setFlatNo] = useState("");
  const [block, setBlock] = useState("");
  const [landmark, setLandmark] = useState("");
  const [freeTextAddress, setFreeTextAddress] = useState("");

  const clusterId = apartment?.cluster ?? clusters[0]?.id;

  // ── Step 2: service ────────────────────────────────────────────────────
  const services = useServices();
  const [serviceId, setServiceId] = useState<string | null>(null);

  // ── Step 3: garment counts + live quote ───────────────────────────────
  const garmentTypes = useGarmentTypes(serviceId ?? undefined);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const totalQty = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const lines = useMemo(
    () =>
      Object.entries(counts)
        .filter(([, qty]) => qty > 0)
        .map(([garment_type, qty]) => ({ garment_type, qty })),
    [counts]
  );
  const quote = useQuoteMutation();
  useEffect(() => {
    if (!hub || !serviceId || lines.length === 0) return;
    const handle = setTimeout(() => {
      quote.mutate({ hub: hub.id, service: serviceId, apartment: apartment?.id, lines });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub?.id, serviceId, apartment?.id, JSON.stringify(lines)]);

  // ── Step 4: pickup slot + notes ────────────────────────────────────────
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 13 * 86_400_000).toISOString().slice(0, 10);
  const capacity = useCapacitySlots({ cluster: clusterId, kind: "PICKUP", from, to });
  const [slotId, setSlotId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  // ── Step 5: phone verification ─────────────────────────────────────────
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();

  // ── Step 6: confirm ────────────────────────────────────────────────────
  const createOrder = useCreateOrder();
  const idempotencyKeyRef = useRef<string | null>(null);
  function confirmIdempotencyKey() {
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey();
    return idempotencyKeyRef.current;
  }

  const canProceed = [
    !!hub,
    addressMode === "apartment" ? !!apartment && flatNo.trim().length > 0 : freeTextAddress.trim().length > 0,
    !!serviceId,
    totalQty > 0,
    true, // slot is optional — a capacity-less booking still gets scheduled
    !!accessToken,
  ][step];

  function normalizedPhone(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (raw.startsWith("+")) return `+${digits}`;
    return `+91${digits}`;
  }

  async function handleSendOtp() {
    await requestOtp.mutateAsync(normalizedPhone(phone));
    setOtpSent(true);
  }

  async function handleVerifyOtp() {
    const result = await verifyOtp.mutateAsync({
      phone: normalizedPhone(phone),
      code,
      full_name: fullName || undefined,
    });
    setAccessToken(result.access);
  }

  async function handleConfirm() {
    if (!hub || !serviceId || !accessToken) return;
    const created = await createOrder.mutateAsync({
      input: {
        hub: hub.id,
        service: serviceId,
        channel,
        apartment: apartment?.id,
        ...(addressMode === "apartment"
          ? { flat_no: flatNo, block }
          : { free_text_address: freeTextAddress, landmark }),
        pickup_capacity: slotId ?? undefined,
        lines,
        notes,
      },
      accessToken,
      idempotencyKey: confirmIdempotencyKey(),
    });
    setOrder(created);
  }

  if (order) {
    return <BookingSuccess order={order} />;
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex items-center gap-2">
        <Icon name="iron" className="size-5 text-brand-yellow" />
        <span className="font-display text-sm font-semibold text-text-primary">IronMan</span>
      </div>

      <Stepper current={step} />

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Where should we pick up from?</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Label htmlFor="pincode">Pincode</Label>
            <Input
              id="pincode"
              inputMode="numeric"
              maxLength={6}
              placeholder="560095"
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
            />
            {pincode.length === 6 && serviceability.isPending && <Skeleton className="h-5 w-40" />}
            {pincode.length === 6 && serviceability.data && !serviceability.data.serviceable && (
              <p className="text-sm text-status-danger">
                We don&apos;t deliver to this pincode yet. We&apos;re expanding soon — check back!
              </p>
            )}
            {hub && (
              <p className="flex items-center gap-1.5 text-sm text-status-success">
                <Icon name="check-circle" className="size-4" /> We service this area from {hub.name}.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Your address</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={addressMode === "apartment" ? "primary" : "outline"}
                size="sm"
                onClick={() => setAddressMode("apartment")}
              >
                Search apartment
              </Button>
              <Button
                type="button"
                variant={addressMode === "manual" ? "primary" : "outline"}
                size="sm"
                onClick={() => setAddressMode("manual")}
              >
                Enter address manually
              </Button>
            </div>

            {addressMode === "apartment" ? (
              <div className="flex flex-col gap-3">
                <Input
                  placeholder="Search your apartment by name…"
                  value={apartmentQuery}
                  onChange={(e) => {
                    setApartmentQuery(e.target.value);
                    setApartment(null);
                  }}
                />
                {apartmentQuery.trim().length >= 2 && !apartment && (
                  <div className="flex flex-col gap-1.5">
                    {apartmentResults.isPending && <Skeleton className="h-9 w-full" />}
                    {apartmentResults.data?.length === 0 && (
                      <p className="text-sm text-text-muted">
                        No match — try a different spelling, or enter your address manually.
                      </p>
                    )}
                    {apartmentResults.data?.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setApartment(a)}
                        className="rounded-md border border-border-default px-3 py-2 text-left text-sm hover:bg-surface-sunken"
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}
                {apartment && (
                  <div className="flex items-center justify-between rounded-md border border-border-default bg-surface-sunken px-3 py-2 text-sm">
                    <span className="flex items-center gap-1.5">
                      <Icon name="apartment" className="size-4" /> {apartment.name}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setApartment(null)}>
                      Change
                    </Button>
                  </div>
                )}
                {apartment && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="flat_no">Flat no.</Label>
                      <Input id="flat_no" value={flatNo} onChange={(e) => setFlatNo(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="block">Block (optional)</Label>
                      <Input id="block" value={block} onChange={(e) => setBlock(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="free_text_address">Full address</Label>
                  <Input
                    id="free_text_address"
                    value={freeTextAddress}
                    onChange={(e) => setFreeTextAddress(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="landmark">Landmark (optional)</Label>
                  <Input id="landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Choose a service</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {services.isPending && <Skeleton className="h-12 w-full" />}
            {services.data?.results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setServiceId(s.id)}
                className={
                  "flex items-center justify-between rounded-md border px-4 py-3 text-left text-sm " +
                  (serviceId === s.id
                    ? "border-brand-yellow bg-surface-sunken"
                    : "border-border-default hover:bg-surface-sunken")
                }
              >
                <span className="text-text-primary">{s.name}</span>
                {serviceId === s.id && <Icon name="check" className="size-4 text-brand-yellow" />}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>What needs ironing?</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {garmentTypes.isPending && <Skeleton className="h-32 w-full" />}
            <div className="flex flex-col gap-3">
              {garmentTypes.data?.results.map((gt) => (
                <div key={gt.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-text-primary">
                    <Icon name="shirt" className="size-4 text-text-muted" /> {gt.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Fewer ${gt.name}`}
                      disabled={!counts[gt.id]}
                      onClick={() =>
                        setCounts((c) => ({ ...c, [gt.id]: Math.max(0, (c[gt.id] ?? 0) - 1) }))
                      }
                    >
                      −
                    </Button>
                    <span className="w-6 text-center tabular-nums">{counts[gt.id] ?? 0}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`More ${gt.name}`}
                      onClick={() => setCounts((c) => ({ ...c, [gt.id]: (c[gt.id] ?? 0) + 1 }))}
                    >
                      <Icon name="plus" className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {totalQty > 0 && (
              <>
                <Separator />
                {quote.isPending && <Skeleton className="h-16 w-full" />}
                {quote.data && (
                  <div className="flex flex-col gap-1 text-sm">
                    <div className="flex justify-between text-text-muted">
                      <span>Subtotal</span>
                      <span>{formatMoney(quote.data.subtotal)}</span>
                    </div>
                    {quote.data.discount.amount_minor > 0 && (
                      <div className="flex justify-between text-status-success">
                        <span>Discount</span>
                        <span>-{formatMoney(quote.data.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-text-primary">
                      <span>Total</span>
                      <span>{formatMoney(quote.data.total)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Pick a pickup slot</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {capacity.isPending && <Skeleton className="h-32 w-full" />}
            {capacity.data && capacity.data.filter((c) => c.available > 0).length === 0 && (
              <p className="text-sm text-text-muted">
                No open slots in the next two weeks — we&apos;ll call you to schedule pickup.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              {capacity.data
                ?.filter((c) => c.available > 0)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSlotId(c.id)}
                    className={
                      "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm " +
                      (slotId === c.id
                        ? "border-brand-yellow bg-surface-sunken"
                        : "border-border-default hover:bg-surface-sunken")
                    }
                  >
                    <span>
                      {formatDate(c.date)}, {formatTime(`${c.date}T${c.window_start}`)}–
                      {formatTime(`${c.date}T${c.window_end}`)}
                    </span>
                    {slotId === c.id && <Icon name="check" className="size-4 text-brand-yellow" />}
                  </button>
                ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Anything we should know? (optional)</Label>
              <Input
                id="notes"
                placeholder="e.g. call before arriving, gate code 1234"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle>Verify your phone</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                inputMode="tel"
                placeholder="98765 43210"
                value={phone}
                disabled={otpSent}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            {!otpSent ? (
              <Button
                type="button"
                onClick={handleSendOtp}
                disabled={phone.trim().length < 8 || requestOtp.isPending}
              >
                Send code
              </Button>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="full_name">Your name</Label>
                  <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="code">6-digit code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                {accessToken ? (
                  <p className="flex items-center gap-1.5 text-sm text-status-success">
                    <Icon name="check-circle" className="size-4" /> Phone verified.
                  </p>
                ) : (
                  <Button
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={code.length !== 6 || verifyOtp.isPending}
                  >
                    Verify
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle>Review &amp; confirm</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <SummaryRow label="Address">
              {addressMode === "apartment"
                ? `${apartment?.name}, Flat ${flatNo}${block ? `, Block ${block}` : ""}`
                : freeTextAddress}
            </SummaryRow>
            <SummaryRow label="Service">
              {services.data?.results.find((s) => s.id === serviceId)?.name}
            </SummaryRow>
            <SummaryRow label="Items">{totalQty} garment(s)</SummaryRow>
            {quote.data && (
              <SummaryRow label="Total">
                <span className="font-semibold text-text-primary">{formatMoney(quote.data.total)}</span>
              </SummaryRow>
            )}
            <Separator />
            <Button type="button" onClick={handleConfirm} disabled={createOrder.isPending}>
              Confirm booking
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Back
        </Button>
        {step < STEPS.length - 1 && (
          <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canProceed}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current + 1} of ${STEPS.length}`}>
      {STEPS.map((label, i) => (
        <div
          key={label}
          className={
            "h-1.5 flex-1 rounded-full " + (i <= current ? "bg-brand-yellow" : "bg-surface-sunken")
          }
          title={label}
        />
      ))}
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className="text-right text-text-primary">{children}</span>
    </div>
  );
}

function BookingSuccess({ order }: { order: OrderDetail }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <Icon name="check-circle" className="size-12 text-status-success" />
      <h1 className="font-display text-xl font-semibold text-text-primary">Booking confirmed!</h1>
      <p className="text-sm text-text-secondary">
        Your order <span className="font-medium text-text-primary">{order.ref}</span> is on its way.
        We&apos;ll send updates over SMS/WhatsApp.
      </p>
      <Button asChild>
        <a href={`/track/${order.tracking_token}`}>Track your order</a>
      </Button>
    </div>
  );
}

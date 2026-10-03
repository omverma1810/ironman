/** Mirrors the DRF serializers in apps/api (docs/04). Kept hand-written and
 * in sync for now; a generated client (from schema/openapi.yaml) is the
 * Phase-2+ upgrade path noted in docs/03 §8 CI. */
import type { Money } from "@/lib/format";

export type Role = "CUSTOMER" | "FIELD" | "OPERATOR" | "ADMIN" | "FOUNDER" | "VIEWER";

export type Me = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string;
  preferred_language: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  mfa_enabled: boolean;
  roles: Role[];
  hub_scope: string[] | "all";
  requires_mfa: boolean;
};

export type Staff = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  roles: Role[];
};

export type Paginated<T> = {
  next: string | null;
  previous: string | null;
  results: T[];
};

export type Hub = {
  id: string;
  code: string;
  name: string;
  address: string;
  timezone: string;
  cutoff_time: string;
  daily_pressing_capacity: number;
  is_active: boolean;
};

export type Cluster = {
  id: string;
  hub: string;
  hub_code: string;
  name: string;
  notes: string;
  is_active: boolean;
};

export type ApartmentContact = {
  id: string;
  apartment: string;
  kind: "WATCHMAN" | "MANAGER" | "RWA";
  name: string;
  phone: string;
  notes: string;
};

export type Apartment = {
  id: string;
  cluster: string;
  cluster_name: string;
  name: string;
  address: string;
  pincode: string;
  gate_notes: string;
  is_active: boolean;
  launched_on: string | null;
  contacts: ApartmentContact[];
};

/** `GET /territory/apartments?q=` — the public booking-wizard search
 * (docs/04 §3.2), deliberately narrower than the staff `Apartment` above:
 * no gate notes or contacts pre-authentication. */
export type PublicApartment = {
  id: string;
  name: string;
  cluster: string;
};

export type RouteDayCapacity = {
  id: string;
  hub: string;
  cluster: string;
  date: string;
  window_start: string;
  window_end: string;
  kind: "PICKUP" | "DELIVERY";
  capacity: number;
  booked_count: number;
  available: number;
};

export type Service = {
  id: string;
  code: string;
  name: string;
  unit: "PER_ITEM" | "PER_KG" | "PER_PAIR";
  sla_hours: number;
  is_active: boolean;
};

export type GarmentType = {
  id: string;
  service: string;
  code: string;
  name: string;
  default_press_seconds: number;
  is_active: boolean;
};

// ── Pricing & offers (docs/08 batch 3.7) ─────────────────────────────────
export type PriceListStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED";

export type PriceLine = {
  id: string;
  garment_type: string;
  garment_type_name: string;
  unit_price_minor: number;
  min_qty: number;
};

export type PriceList = {
  id: string;
  hub: string;
  service: string;
  service_name: string;
  version: number;
  status: PriceListStatus;
  effective_from: string | null;
  effective_to: string | null;
  notes: string;
  lines: PriceLine[];
  created_at: string;
};

export type CreatePriceListInput = {
  hub: string;
  service: string;
  notes?: string;
};

export type ActivatePriceListInput = {
  effective_from?: string;
};

export type SetPriceLinesInput = {
  lines: { garment_type: string; unit_price_minor: number; min_qty?: number }[];
};

export type OfferKind = "FIRST_ORDER" | "REFERRAL_CREDIT" | "APARTMENT_PROMO" | "FLAT" | "PERCENT";

export type Offer = {
  id: string;
  code: string;
  kind: OfferKind;
  value_bps: number;
  value_minor: number;
  cap_minor: number | null;
  apartment: string | null;
  effective_from: string;
  effective_to: string | null;
  max_redemptions: number | null;
  redemptions_count: number;
  is_active: boolean;
};

export type OfferInput = {
  code: string;
  kind: OfferKind;
  value_bps?: number;
  value_minor?: number;
  cap_minor?: number | null;
  apartment?: string | null;
  effective_from: string;
  effective_to?: string | null;
  max_redemptions?: number | null;
  is_active?: boolean;
};

export type QuoteLine = {
  garment_type: string;
  garment_type_name: string;
  qty: number;
  unit_price: Money;
  line_total: Money;
};

export type Quote = {
  price_list_id: string;
  price_list_version: number;
  lines: QuoteLine[];
  subtotal: Money;
  discount: Money;
  total: Money;
  offers_applied: string[];
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  status: "LEAD" | "ACTIVE" | "LAPSED" | "BLOCKED";
  first_order_at: string | null;
  last_order_at: string | null;
  lifetime_orders: number;
  lifetime_gross_minor: number;
  acquisition_channel: string;
};

export type CustomerDetail = Customer & {
  email: string;
  preferred_language: string;
  acquisition_apartment: string | null;
  addresses: Address[];
  notes: CustomerNote[];
  created_at: string;
};

export type Address = {
  id: string;
  customer: string;
  apartment: string | null;
  apartment_name: string;
  flat_no: string;
  block: string;
  landmark: string;
  free_text_address: string;
  label: string;
  is_default: boolean;
};

export type AddressInput = {
  apartment?: string;
  flat_no?: string;
  block?: string;
  landmark?: string;
  free_text_address?: string;
  label?: string;
  is_default?: boolean;
};

export type CustomerNote = {
  id: string;
  body: string;
  is_internal: boolean;
  author: string | null;
  author_name: string;
  created_at: string;
};

export type OrderStatus =
  | "DRAFT"
  | "PENDING_CONFIRMATION"
  | "SCHEDULED"
  | "PICKUP_ASSIGNED"
  | "PICKUP_EN_ROUTE"
  | "PICKUP_FAILED"
  | "PICKED_UP"
  | "AT_HUB"
  | "INTAKE_VERIFIED"
  | "IN_PRODUCTION"
  | "READY"
  | "DELIVERY_ASSIGNED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERY_FAILED"
  | "RETURNED_TO_HUB"
  | "DELIVERED"
  | "ON_HOLD"
  | "CANCELLED"
  | "CLOSED";

export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "WRITTEN_OFF";
export type Channel = "WEB" | "WHATSAPP" | "COUNTER" | "PHONE" | "APP";

export type OrderLine = {
  id: string;
  garment_type: string;
  garment_type_name: string;
  declared_qty: number;
  verified_qty: number | null;
  unit_price_minor: number;
  line_total_minor: number;
  notes: string;
};

export type OrderListItem = {
  id: string;
  ref: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  channel: Channel;
  customer: string;
  customer_name: string;
  customer_phone: string;
  apartment: string | null;
  apartment_name: string;
  service: string;
  service_name: string;
  pickup_slot_start: string | null;
  pickup_slot_end: string | null;
  delivery_slot_start: string | null;
  delivery_slot_end: string | null;
  declared_total_qty: number;
  verified_total_qty: number | null;
  total_minor: number;
  created_at: string;
  is_late_pickup: boolean;
  has_feedback: boolean;
};

export type OrderDetail = OrderListItem & {
  hub: string;
  address: string | null;
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  offers_applied: string[];
  notes: string;
  special_instructions: string;
  referral_code: string;
  picked_up_at: string | null;
  delivered_at: string | null;
  pickup_promised_at: string | null;
  delivery_promised_at: string | null;
  cancelled_reason: string;
  cancelled_at: string | null;
  lines: OrderLine[];
  tracking_token: string;
};

export type OrderEvent = {
  id: string;
  event_type: string;
  from_status: string;
  to_status: string;
  actor: string | null;
  actor_name: string;
  actor_role: string;
  payload: Record<string, unknown>;
  created_at: string;
};

/** The coarse rollup `ordering.stages`/`packages/tokens`' `stageLabels` use
 * — narrower than `OrderStatus`, kept in sync by hand across API/web/mobile. */
export type OrderStage =
  | "booked"
  | "pickup"
  | "atHub"
  | "pressing"
  | "ready"
  | "out"
  | "delivered"
  | "failed"
  | "hold";

export type PublicOrderEvent = {
  event_type: string;
  to_status: OrderStatus;
  stage: OrderStage | null;
  created_at: string;
};

export type PublicInvoiceSummary = {
  ref: string;
  status: string;
  issued_at: string | null;
  total_minor: number;
  pdf_url: string | null;
};

/** The `/track/{token}` response (batch 4.1) — a deliberately narrower
 * view than `OrderDetail`: no ids, no phone/email, no staff identity. */
export type PublicOrderTracking = {
  ref: string;
  status: OrderStatus;
  stage: OrderStage;
  stage_label: string;
  payment_status: PaymentStatus;
  customer_name: string;
  service_name: string;
  address: string | null;
  pickup_slot_start: string | null;
  pickup_slot_end: string | null;
  delivery_slot_start: string | null;
  delivery_slot_end: string | null;
  pickup_promised_at: string | null;
  delivery_promised_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  declared_total_qty: number;
  verified_total_qty: number | null;
  total_minor: number;
  lines: OrderLine[];
  invoice: PublicInvoiceSummary | null;
  events: PublicOrderEvent[];
  created_at: string;
};

export type ReQuote = {
  id: string;
  order: string;
  order_ref: string;
  reason: string;
  old_total_minor: number;
  new_total_minor: number;
  decision: "PENDING" | "APPROVED" | "REJECTED";
  sent_at: string;
  decided_at: string | null;
};

export type OrderException = {
  id: string;
  order: string;
  order_ref: string;
  kind: "DAMAGED" | "LOST" | "MISSING" | "WRONG_ITEM" | "REPRESS" | "COMPLAINT";
  severity: "LOW" | "MEDIUM" | "HIGH";
  description: string;
  raised_by: string | null;
  raised_by_name: string;
  assigned_to: string | null;
  assigned_to_name: string;
  sla_due_at: string | null;
  status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "WRITTEN_OFF";
  resolution: string;
  cost_minor: number;
  resolved_at: string | null;
  created_at: string;
};

// ── Custody (docs/02 §3.6, docs/01 §5.3) ────────────────────────────────
export type GarmentStage =
  | "RECEIVED"
  | "SORTED"
  | "PRESSING"
  | "PRESSED"
  | "QC"
  | "REWORK"
  | "PACKED"
  | "DISPATCHED"
  | "DELIVERED"
  | "DAMAGED"
  | "LOST"
  | "HELD"
  | "RETURNED_UNPRESSED";

export type GarmentLine = {
  id: string;
  order_line: string;
  bag: string;
  bag_code: string;
  order: string;
  order_ref: string;
  delivery_promised_at: string | null;
  hub: string;
  seq: number;
  garment_type: string;
  garment_type_name: string;
  stage: GarmentStage;
  // The timestamp this garment entered `stage` — from the append-only
  // scan trail, falling back to `created_at` if never scanned.
  stage_entered_at: string;
  condition_notes: string;
  defect_flags: string[];
  is_rework: boolean;
  rework_count: number;
  created_at: string;
};

export type WipSummary = Record<GarmentStage, number>;

export type Bag = {
  id: string;
  code: string;
  order: string;
  order_ref: string;
  hub: string;
  garment_count: number;
  garment_line_count: number;
  current_stage: GarmentStage;
  printed_at: string | null;
  created_at: string;
};

export type BagDetail = Bag & { garment_lines: GarmentLine[] };

export type StageEvent = {
  id: string;
  bag: string | null;
  garment_line: string | null;
  from_stage: string;
  to_stage: string;
  actor: string | null;
  actor_name: string;
  station: string;
  scanned: boolean;
  occurred_at: string;
  device_id: string;
};

export type ScanResult = {
  bag: BagDetail;
  moved_count: number;
  skipped_count: number;
  skipped: GarmentLine[];
};

// ── Fulfilment (docs/02 §3.7) ───────────────────────────────────────────
export type JobKind = "PICKUP" | "DELIVERY";
export type JobStatus = "PENDING" | "EN_ROUTE" | "ARRIVED" | "DONE" | "FAILED";
export type RouteDayStatus = "PLANNED" | "ACTIVE" | "CLOSED";

export type Job = {
  id: string;
  route_day: string;
  order: string;
  order_ref: string;
  kind: JobKind;
  sequence: number;
  assigned_to: string | null;
  assigned_to_name: string;
  status: JobStatus;
  slot_start: string | null;
  slot_end: string | null;
  started_at: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  attempt_no: number;
};

export type RouteDay = {
  id: string;
  hub: string;
  cluster: string;
  cluster_name: string;
  date: string;
  status: RouteDayStatus;
  job_count: number;
  created_at: string;
};

export type RouteDayDetail = RouteDay & { jobs: Job[]; staff: string[] };

export type JobAttempt = {
  id: string;
  job: string;
  attempt_no: number;
  outcome: "DONE" | "FAILED";
  failure_reason: string;
  notes: string;
  at: string;
};

export type ProofKind = "PHOTO" | "OTP" | "SIGNATURE";

export type Proof = {
  id: string;
  job: string;
  kind: ProofKind;
  file_url: string | null;
  otp_verified: boolean;
  geo_lat: string | null;
  geo_lng: string | null;
  at: string;
};

export type ProofMeta = {
  kind: ProofKind;
  otp_verified?: boolean;
  geo_lat?: number | null;
  geo_lng?: number | null;
};

export type DeclaredLine = { garment_type: string; qty: number };

export type OfflineOpStatus = "PENDING" | "APPLIED" | "CONFLICT" | "REJECTED";

export type OfflineOpResult = {
  client_op_id: string;
  op_type: string;
  status: OfflineOpStatus;
  result_detail: string;
};

export type OrderLineInput = { garment_type: string; qty: number };

export type AttributionBasis =
  | "CODE"
  | "SELF_REPORTED"
  | "ORDER_CHANNEL"
  | "DEFAULT"
  | "BACKFILL";

export type Attribution = {
  id: string;
  customer: string;
  customer_name: string;
  order: string | null;
  order_ref: string;
  channel_code: string;
  channel_name: string;
  partner: string | null;
  partner_name: string;
  code: string;
  apartment_name: string;
  is_first_touch: boolean;
  basis: AttributionBasis;
  captured_at: string;
};

export type CreateOrderInput = {
  hub: string;
  // Required for a staff caller (booking on someone else's behalf) — a
  // customer caller's own booking never sends this, their identity comes
  // from their session instead (apps/api ordering/views.py::_is_customer_only).
  customer?: string;
  service: string;
  address?: string;
  // A first-time customer with no saved address sends these instead of
  // `address` — the API creates one for them on the spot.
  flat_no?: string;
  block?: string;
  landmark?: string;
  free_text_address?: string;
  apartment?: string;
  channel: Channel;
  pickup_capacity?: string;
  lines: OrderLineInput[];
  notes?: string;
  special_instructions?: string;
  referral_code?: string;
  // "How did you hear about us?" — a growth channel code (batch 5.2).
  acquisition_source?: string;
};

export type StockUnit = "PIECE" | "LITRE" | "KG" | "ROLL";

export type StockCategory = "HANGER" | "COVER" | "BAG" | "CHEMICAL" | "SPARE" | "OTHER";

export type StockItem = {
  id: string;
  hub: string;
  sku: string;
  name: string;
  unit: StockUnit;
  category: StockCategory;
  reorder_level: number;
  is_active: boolean;
  created_at: string;
};

export type StockItemInput = {
  hub: string;
  sku: string;
  name: string;
  unit: StockUnit;
  category: StockCategory;
  reorder_level?: number;
  is_active?: boolean;
};

export type StockLevel = {
  id: string;
  hub: string;
  stock_item: string;
  sku: string;
  name: string;
  unit: StockUnit;
  reorder_level: number;
  qty_on_hand: number;
  /** Absent for Operators — cost is Admin/Founder-only data. */
  avg_unit_cost_minor?: number;
};

export type MovementKind = "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "WASTAGE" | "RETURN";

export type AdjustmentKind = Exclude<MovementKind, "RECEIPT">;

export type StockMovement = {
  id: string;
  hub: string;
  stock_item: string;
  sku: string;
  delta_qty: number;
  kind: MovementKind;
  order: string | null;
  unit_cost_minor: number | null;
  supplier: string;
  invoice_ref: string;
  actor: string | null;
  actor_name: string;
  note: string;
  at: string;
};

export type StockReceiptInput = {
  item: string;
  qty: number;
  unit_cost: number;
  supplier?: string;
  invoice_ref?: string;
  note?: string;
};

export type StockAdjustmentInput = {
  item: string;
  delta: number;
  kind: AdjustmentKind;
  note?: string;
};

export type ConsumptionRule = {
  id: string;
  service: string;
  service_name: string;
  garment_type: string | null;
  garment_type_name: string;
  stock_item: string;
  stock_item_sku: string;
  qty_per_unit: string;
};

export type ConsumptionRuleInput = {
  service: string;
  garment_type?: string | null;
  stock_item: string;
  qty_per_unit: string;
};

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";

export type Invoice = {
  id: string;
  ref: string;
  hub: string;
  order: string;
  order_ref: string;
  customer_name: string;
  status: InvoiceStatus;
  issued_at: string | null;
  total_minor: number;
  gst_applied: boolean;
  // Sum of SUCCEEDED payments — on both the list and detail serializers
  // since the order-detail page's Invoice card reads the list endpoint.
  paid_minor: number;
  credited_minor: number;
  // total − credit notes − payments. Negative means the customer paid more
  // than they now owe (a credit note landed after payment): a refund is due.
  balance_minor: number;
};

export type UninvoicedDelivery = {
  id: string;
  ref: string;
  customer_name: string;
  delivered_at: string;
  total_minor: number;
};

export type InvoiceListParams = {
  status?: string;
  order?: string;
  search?: string;
  issued_from?: string;
  issued_to?: string;
  outstanding?: boolean;
  limit?: number;
};

export type InvoiceSnapshotLine = {
  garment_type_name: string;
  qty: number;
  unit_price_minor: number;
  line_total_minor: number;
};

export type CreditNote = {
  id: string;
  invoice: string;
  reason: string;
  amount_minor: number;
  issued_by_name: string;
  at: string;
  pdf_url: string | null;
};

// COD / UPI-QR-at-door (docs/08 3.2), plus CREDIT (docs/08 3.6, store
// credit) — GATEWAY exists in the domain model but isn't recordable
// through this UI yet (docs/08 3.5).
export type PaymentMethod = "CASH" | "UPI_QR" | "GATEWAY" | "CREDIT" | "ADJUSTMENT";
// Named distinctly from the order-level `PaymentStatus` above (billing's
// per-payment SUCCEEDED/FAILED vs ordering's UNPAID/PARTIALLY_PAID/PAID/
// WRITTEN_OFF aggregate) — same enum-name collision the backend resolves
// via `billing.models.PaymentStatus` vs `ordering.models.PaymentStatus`.
export type PaymentRecordStatus = "SUCCEEDED" | "FAILED";

export type Payment = {
  id: string;
  invoice: string;
  method: PaymentMethod;
  amount_minor: number;
  status: PaymentRecordStatus;
  gateway_ref: string;
  collected_by_name: string;
  at: string;
};

export type RecordPaymentInput = {
  method: "CASH" | "UPI_QR" | "ADJUSTMENT" | "CREDIT";
  // Minor units (paise) on the wire, same convention as `CreditNoteInput`.
  amount: number;
  idempotency_key: string;
  gateway_ref?: string;
};

export type InvoiceDetail = Invoice & {
  hub_name: string;
  customer: string;
  customer_phone: string;
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  gstin_snapshot: string;
  price_list_version: number | null;
  snapshot: InvoiceSnapshotLine[];
  pdf_url: string | null;
  credit_notes: CreditNote[];
  credited_minor: number;
  payments: Payment[];
};

export type CreditNoteInput = {
  reason: string;
  amount: number;
};

// ── Cash custody (docs/08 batch 3.3) ─────────────────────────────────────
export type CashBalance = {
  balance_minor: number;
};

export type HandoverRecipient = {
  id: string;
  full_name: string;
  email: string;
};

export type HandoverStatus = "PENDING" | "CONFIRMED";

export type CashHandover = {
  id: string;
  hub: string;
  from_user: string;
  from_user_name: string;
  to_user: string;
  to_user_name: string;
  declared_amount_minor: number;
  received_amount_minor: number | null;
  variance_minor: number;
  variance_note: string;
  status: HandoverStatus;
  confirmed_by_name: string;
  confirmed_at: string | null;
  created_at: string;
};

export type InitiateHandoverInput = {
  to_user: string;
  amount: number;
};

export type ConfirmHandoverInput = {
  received_amount: number;
  note?: string;
};

export type CashDeposit = {
  id: string;
  hub: string;
  amount_minor: number;
  deposited_by_name: string;
  reference: string;
  notes: string;
  at: string;
};

export type CreateDepositInput = {
  hub?: string;
  amount: number;
  reference?: string;
  notes?: string;
};

export type CashReconciliationRow = {
  rider_id: string;
  rider_name: string;
  collected_minor: number;
  declared_minor: number;
  received_minor: number;
  variance_minor: number;
  outstanding_minor: number;
  pending_handovers: number;
};

// ── Order cost model (docs/08 batch 3.4) ─────────────────────────────────
export type OrderCostKind = "CONSUMABLE" | "LABOUR" | "COMMISSION" | "DELIVERY" | "OTHER";

export type OrderCost = {
  id: string;
  kind: OrderCostKind;
  amount_minor: number;
  source_ref: string;
  at: string;
};

export type OrderContributionMargin = {
  revenue_minor: number;
  consumable_minor: number;
  commission_minor: number;
  labour_minor: number;
  delivery_minor: number;
  other_minor: number;
  contribution_minor: number;
  contribution_pct: number | null;
  costs: OrderCost[];
};

// ── Customer credit ledger (docs/08 batch 3.6) ────────────────────────────
export type CreditReason = "REFERRAL" | "GOODWILL" | "REFUND" | "SPEND" | "EXPIRY";

export type CreditEntry = {
  id: string;
  delta_minor: number;
  reason: CreditReason;
  order: string | null;
  order_ref: string;
  note: string;
  created_by_name: string;
  at: string;
};

export type CustomerCredit = {
  balance_minor: number;
  entries: CreditEntry[];
};

// SPEND/EXPIRY are never manually granted (docs/08 3.6: SPEND happens only
// via `record_payment`, EXPIRY has no scheduled job yet) — same narrowing
// `GrantCreditSerializer` enforces server-side.
export type GrantCreditInput = {
  reason: "REFERRAL" | "GOODWILL" | "REFUND";
  amount: number;
  note?: string;
};

// ── Notifications (batch 4.2) ────────────────────────────────────────────
export type NotificationChannel = "WHATSAPP" | "SMS" | "PUSH" | "EMAIL";
export type NotificationRequestStatus = "PENDING" | "SENT" | "SKIPPED" | "FAILED";
export type NotificationDeliveryStatus = "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED";

export type NotificationDelivery = {
  id: string;
  provider: string;
  provider_message_id: string;
  status: NotificationDeliveryStatus;
  error: string;
  cost_minor: number;
  created_at: string;
};

export type NotificationRequestRow = {
  id: string;
  order: string | null;
  order_ref: string;
  template_code: string;
  channel: NotificationChannel;
  recipient_kind: "CUSTOMER" | "STAFF";
  recipient_id: string;
  status: NotificationRequestStatus;
  skipped_reason: string;
  created_at: string;
  deliveries: NotificationDelivery[];
};

// ── Growth / customer feedback (batch 4.6, docs/02 §3.10) ────────────────
export type Feedback = {
  id: string;
  order: string;
  order_ref: string;
  customer_name: string;
  rating: number;
  comment: string;
  tags: string[];
  is_public: boolean;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
};

export type FeedbackInput = {
  order: string;
  rating: number;
  comment?: string;
  tags?: string[];
};

// ── Growth / referral partners & codes (batch 5.1, docs/02 §3.10) ────────
export type PartnerKind = "WATCHMAN" | "INFLUENCER" | "OTHER";

export type PartnerStatus = "ACTIVE" | "INACTIVE";

export type ReferralPartner = {
  id: string;
  hub: string;
  kind: PartnerKind;
  name: string;
  phone: string;
  apartment: string | null;
  apartment_name: string;
  upi_id: string;
  status: PartnerStatus;
  onboarded_by: string | null;
  onboarded_by_name: string;
  notes: string;
  commission_rule: string | null;
  commission_rule_name: string;
  /** Earned, not yet in a settlement (paise). */
  accrued_minor: number;
  /** Earned and not yet paid, including amounts in a pending settlement. */
  payable_minor: number;
  created_at: string;
};

// ── Commission (docs/08 batches 5.3/5.4) ─────────────────────────────────
export type CommissionBasis = "PER_ORDER" | "PER_ITEM" | "PERCENT_OF_ORDER" | "FLAT_FIRST_ORDER";
export type CommissionAppliesTo = "FIRST_ORDER_ONLY" | "ALL_ORDERS" | "FIRST_N_ORDERS";

export type CommissionRule = {
  id: string;
  hub: string;
  name: string;
  basis: CommissionBasis;
  /** Paise for fixed bases; basis points (1/100 %) for PERCENT_OF_ORDER. */
  value: number;
  applies_to: CommissionAppliesTo;
  first_n: number | null;
  cap_minor: number | null;
  effective_from: string;
  effective_to: string | null;
  is_default: boolean;
  partner_count: number;
  has_accruals: boolean;
  created_at: string;
};

export type CommissionRuleInput = {
  hub: string;
  name: string;
  basis: CommissionBasis;
  value: number;
  applies_to: CommissionAppliesTo;
  first_n?: number | null;
  cap_minor?: number | null;
  effective_from?: string;
  effective_to?: string | null;
  is_default?: boolean;
};

export type AccrualStatus = "ACCRUED" | "APPROVED" | "SETTLED" | "VOID";

export type CommissionAccrual = {
  id: string;
  hub: string;
  partner: string;
  partner_name: string;
  order: string;
  order_ref: string;
  rule: string;
  rule_name: string;
  rule_terms: Record<string, unknown>;
  amount_minor: number;
  status: AccrualStatus;
  settlement: string | null;
  settlement_ref: string;
  accrued_at: string;
  void_reason: string;
};

export type PartnerBalance = {
  partner: string;
  accrued_minor: number;
  in_settlement_minor: number;
  payable_minor: number;
  paid_minor: number;
  void_minor: number;
};

export type SettlementStatus = "PENDING" | "PAID" | "CANCELLED";
export type PayoutMethod = "UPI" | "CASH" | "BANK";

export type Settlement = {
  id: string;
  hub: string;
  ref: string;
  partner: string;
  partner_name: string;
  partner_upi_id: string;
  period_start: string | null;
  period_end: string;
  total_minor: number;
  status: SettlementStatus;
  paid_at: string | null;
  payment_method: string;
  payment_ref: string;
  approved_by: string | null;
  approved_by_name: string;
  accrual_count: number;
  created_at: string;
};

// ── Customer referrals (docs/08 batch 5.5) ───────────────────────────────
export type MyReferral = {
  code: string;
  is_active: boolean;
  friends_joined: number;
  rewards_count: number;
  rewards_earned_minor: number;
  referrer_reward_minor: number;
  referee_reward_minor: number;
  min_order_minor: number;
  credit_balance_minor: number;
};

export type ReferralProgram = {
  id: string;
  hub: string;
  is_active: boolean;
  referrer_reward_minor: number;
  referee_reward_minor: number;
  min_order_minor: number;
  updated_at: string;
};

export type ReferralProgramInput = Partial<
  Pick<
    ReferralProgram,
    "is_active" | "referrer_reward_minor" | "referee_reward_minor" | "min_order_minor"
  >
>;

export type CustomerReferralReward = {
  id: string;
  hub: string;
  referrer: string;
  referrer_name: string;
  referee: string;
  referee_name: string;
  code: string;
  order: string;
  order_ref: string;
  referrer_credit_minor: number;
  referee_credit_minor: number;
  created_at: string;
};

// ── Marketing (docs/08 batch 5.6) ────────────────────────────────────────
export type GrowthChannelCode =
  | "WATCHMAN"
  | "CUSTOMER_REFERRAL"
  | "INFLUENCER"
  | "FLYER"
  | "DIGITAL_AD"
  | "WALK_IN"
  | "ORGANIC"
  | "WHATSAPP";

export type SpendCategory = "INFLUENCER" | "PRINT" | "ADS" | "INCENTIVE" | "OTHER";

export type Campaign = {
  id: string;
  hub: string;
  name: string;
  channel: GrowthChannelCode;
  channel_name: string;
  apartment: string | null;
  apartment_name: string;
  cluster: string | null;
  cluster_name: string;
  start_on: string;
  end_on: string | null;
  objective: string;
  summary: { spend_minor: number; new_customers: number; cost_per_customer_minor: number | null };
  created_at: string;
};

export type CampaignInput = {
  hub: string;
  name: string;
  channel: GrowthChannelCode;
  apartment?: string | null;
  start_on?: string;
  end_on?: string | null;
  objective?: string;
};

export type Spend = {
  id: string;
  hub: string;
  campaign: string;
  campaign_name: string;
  channel: GrowthChannelCode;
  amount_minor: number;
  spent_on: string;
  category: SpendCategory;
  note: string;
  entered_by_name: string;
  created_at: string;
};

export type SpendInput = {
  campaign: string;
  amount_minor: number;
  category: SpendCategory;
  spent_on?: string;
  note?: string;
};

export type ChannelCost = {
  channel: GrowthChannelCode;
  channel_name: string;
  is_paid: boolean;
  spend_minor: number;
  commission_minor: number;
  new_customers: number;
  cac_minor: number | null;
};

export type AcquisitionCost = {
  start: string;
  end: string;
  channels: ChannelCost[];
  total_cost_minor: number;
  new_customers: number;
  blended_cac_minor: number | null;
  paid_cac_minor: number | null;
};

// ── Re-engagement (docs/08 batch 5.7) ────────────────────────────────────
export type LapsedCustomer = {
  customer: string;
  name: string;
  phone: string;
  apartment_name: string;
  delivered_orders: number;
  spent_minor: number;
  last_delivered_at: string;
  days_since: number;
  last_contacted_at: string | null;
};

export type ReengagementResult = {
  eligible: number;
  sent: number;
  recently_contacted: number;
  opted_out: number;
  not_sent: number;
};

export type ReferralPartnerInput = {
  hub: string;
  kind: PartnerKind;
  name: string;
  phone: string;
  apartment?: string | null;
  upi_id?: string;
  notes?: string;
};

export type ReferralCode = {
  id: string;
  hub: string;
  code: string;
  owner_partner: string | null;
  owner_partner_name: string;
  owner_customer: string | null;
  owner_customer_name: string;
  apartment: string | null;
  apartment_name: string;
  is_active: boolean;
  uses_count: number;
  created_at: string;
};

export type ReferralCodeInput = {
  hub: string;
  owner_partner?: string | null;
  owner_customer?: string | null;
  apartment?: string | null;
  code?: string;
};

// ── Analytics (docs/08 batch 6.2) ────────────────────────────────────────
export type MetricKey =
  | "new_customers"
  | "repeat_customers"
  | "orders_per_customer"
  | "acquisition_cost"
  | "referrals"
  | "apartments"
  | "average_order_value"
  | "contribution"
  | "on_time"
  | "feedback";

export type MetricTile = {
  key: MetricKey;
  label: string;
  restricted: boolean;
  value?: number | null;
  previous?: number | null;
  trend?: { week: string; value: number | null }[];
  [extra: string]: unknown;
};

export type WeeklyMetrics = { week_start: string; week_end: string; tiles: MetricTile[] };

export type MetricRows = {
  key: MetricKey;
  label: string;
  value: number | null;
  rows: Record<string, string | number | null>[];
};

export type ApartmentPerformanceRow = {
  apartment: string;
  name: string;
  cluster: string;
  days_since_launch: number | null;
  customers: number;
  new_customers: number;
  orders: number;
  repeat_rate: number | null;
  aov_minor: number | null;
  margin_minor?: number;
  avg_rating: number | null;
  orders_per_customer: number | null;
  score: number;
};

export type ChannelPerformanceRow = {
  channel: string;
  channel_name: string;
  new_customers: number;
  spend_minor: number;
  commission_minor: number;
  cac_minor: number | null;
  repeat_rate: number | null;
  revenue_60d_per_customer_minor: number | null;
};

export type UnitEconomics = {
  from: string;
  to: string;
  orders: number;
  margin_pct: number | null;
  steps: { step: string; total_minor: number; per_order_minor: number | null }[];
};

export type OperationsDaily = {
  date: string;
  on_time: { value: number | null; pickup: number | null; delivery: number | null; jobs: number };
  wip: { status: string; label: string; orders: number; oldest_hours: number; average_hours: number }[];
  capacity: { slots: number; booked: number; utilisation: number | null };
  overdue: {
    order: string;
    ref: string;
    customer: string;
    status: string;
    promised: string;
    hours_late: number;
  }[];
  open_exceptions: Partial<Record<"LOW" | "MEDIUM" | "HIGH", number>>;
};

export type Checkpoint = {
  as_of: string;
  launched_on: string | null;
  days_live: number;
  checkpoint: number;
  orders: number;
  customers: number;
  new_customers: number;
  orders_per_customer: number | null;
  aov_minor: number | null;
  contribution_per_order_minor: number | null;
  margin_pct: number | null;
  cohort_repeat_rate: number | null;
  cohort_size: number;
  top_apartments: ApartmentPerformanceRow[];
  channels: ChannelPerformanceRow[];
  price_versions: { version: number | null; orders: number; avg_order_minor: number | null }[];
  active_customers_total: number;
};

export type DataQualityCheck = {
  key: string;
  label: string;
  value: number;
  threshold: number;
  ok: boolean;
  explain: string;
  rows: Record<string, string | number | null>[];
  row_count: number;
};

export type DataQuality = { checked_at: string; failing: number; checks: DataQualityCheck[] };

// ── Privacy (docs/06 §5–6) ─────────────────────────────────────────────

export type DeletionBlocker = { code: string; message: string; refs: string[] };

export type DeletionCheck = {
  can_delete: boolean;
  blockers: DeletionBlocker[];
  grace_days: number;
};

export type DeletionScheduled = {
  status: "PENDING" | "CANCELLED" | "COMPLETED";
  requested_at: string;
  scheduled_for: string;
};

// ── Audit log (docs/06 §3.3) ───────────────────────────────────────────

export type AuditEventRow = {
  id: string;
  created_at: string;
  actor: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  object_type: string;
  object_id: string;
  hub: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  ip: string | null;
};

export type AuditLogParams = {
  action?: string;
  object_type?: string;
  object_id?: string;
  from?: string;
  to?: string;
  cursor?: string;
};

// ── Staff management (docs/06 §3.1 "Manage users & roles") ─────────────

export type StaffRole = Exclude<Role, "CUSTOMER">;

export type TeamMember = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  last_login: string | null;
  roles: { role: StaffRole; hub: string | null; hub_name: string }[];
};

export type StaffInvite = {
  id: string;
  email: string;
  role: StaffRole;
  hub: string | null;
  hub_name: string;
  invited_by_name: string;
  expires_at: string;
  token?: string;
};

export type Team = { members: TeamMember[]; invites: StaffInvite[] };

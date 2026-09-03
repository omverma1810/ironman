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
  apartment: string | null;
  apartment_name: string;
  flat_no: string;
  block: string;
  landmark: string;
  free_text_address: string;
  label: string;
  is_default: boolean;
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

export type CreateOrderInput = {
  hub: string;
  customer: string;
  service: string;
  address?: string;
  apartment?: string;
  channel: Channel;
  pickup_capacity?: string;
  lines: OrderLineInput[];
  notes?: string;
  special_instructions?: string;
  referral_code?: string;
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
  avg_unit_cost_minor: number;
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

// COD / UPI-QR-at-door (docs/08 3.2) — GATEWAY and CREDIT exist in the
// domain model but aren't recordable through this batch's UI (later
// batches: 3.5 gateway, 3.6 credit ledger).
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
  method: "CASH" | "UPI_QR" | "ADJUSTMENT";
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

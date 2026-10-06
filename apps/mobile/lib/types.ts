/** A trimmed mirror of apps/web/lib/api/types.ts's own Order/Me shapes —
 * only the fields this app's screens actually read. */

export type Role = "CUSTOMER" | "FIELD" | "OPERATOR" | "ADMIN" | "FOUNDER" | "VIEWER";

export type Me = {
  id: string;
  full_name: string;
  phone: string | null;
  preferred_language?: string;
  roles: Role[];
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

export type OrderListItem = {
  id: string;
  ref: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  service: string;
  service_name: string;
  apartment_name: string;
  pickup_slot_start: string | null;
  pickup_slot_end: string | null;
  delivery_slot_start: string | null;
  delivery_slot_end: string | null;
  total_minor: number;
  has_feedback: boolean;
};

export type OrderLine = {
  id: string;
  garment_type: string;
  garment_type_name: string;
  verified_qty: number | null;
  declared_qty: number;
  line_total_minor: number;
};

export type OrderEvent = {
  id: string;
  event_type: string;
  from_status: string;
  to_status: string;
  actor_name: string;
  created_at: string;
};

export type OrderDetail = OrderListItem & {
  address: string | null;
  notes: string;
  lines: OrderLine[];
  tracking_token: string;
};

/** `/track/{token}` — the customer-safe view: no staff names, no internal notes. */
export type TrackingEvent = {
  event_type: string;
  to_status: string;
  stage: string | null;
  created_at: string;
};

export type Tracking = {
  ref: string;
  status: OrderStatus;
  stage: string;
  stage_label: string;
  payment_status: PaymentStatus;
  address: string | null;
  pickup_slot_start: string | null;
  pickup_slot_end: string | null;
  delivery_slot_start: string | null;
  delivery_slot_end: string | null;
  delivered_at: string | null;
  total_minor: number;
  lines: OrderLine[];
  invoice: { ref: string; status: string; issued_at: string | null; total_minor: number; pdf_url: string | null } | null;
  events: TrackingEvent[];
};

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

export type NotificationChannel = "WHATSAPP" | "SMS" | "EMAIL" | "PUSH";

export type NotificationPref = { channel: NotificationChannel; opted_in: boolean };

export type Paginated<T> = {
  next: string | null;
  previous: string | null;
  results: T[];
};

export type ReQuote = {
  id: string;
  order: string;
  order_ref: string;
  reason: string;
  old_total_minor: number;
  new_total_minor: number;
  decision: "PENDING" | "APPROVED" | "REJECTED";
};

export type FeedbackInput = {
  order: string;
  rating: number;
  comment?: string;
};

// ── Booking (docs/08 batch 8.1) ─────────────────────────────────────────

export type Money = { amount_minor: number; currency: string };

export type Serviceability = {
  serviceable: boolean;
  hub: { id: string; code: string; name: string } | null;
  clusters: { id: string; name: string }[];
};

export type PublicApartment = { id: string; name: string; cluster: string };

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

export type PickupSlot = {
  id: string;
  cluster: string;
  date: string;
  window_start: string;
  window_end: string;
  kind: "PICKUP" | "DELIVERY";
  capacity: number;
  booked_count: number;
  available: number;
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

export type Channel = "WEB" | "WHATSAPP" | "COUNTER" | "PHONE" | "APP";

export type OrderLineInput = { garment_type: string; qty: number };

export type CreateOrderInput = {
  hub: string;
  service: string;
  channel: Channel;
  address?: string;
  flat_no?: string;
  block?: string;
  landmark?: string;
  free_text_address?: string;
  apartment?: string;
  pickup_capacity?: string;
  lines: OrderLineInput[];
  notes?: string;
  referral_code?: string;
  acquisition_source?: string;
};

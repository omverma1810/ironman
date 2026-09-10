/** A trimmed mirror of apps/web/lib/api/types.ts's own Order/Me shapes —
 * only the fields this app's screens actually read. */

export type Role = "CUSTOMER" | "FIELD" | "OPERATOR" | "ADMIN" | "FOUNDER" | "VIEWER";

export type Me = {
  id: string;
  full_name: string;
  phone: string | null;
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
  service_name: string;
  apartment_name: string;
  pickup_slot_start: string | null;
  delivery_slot_start: string | null;
  total_minor: number;
};

export type OrderLine = {
  id: string;
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
};

export type Paginated<T> = {
  next: string | null;
  previous: string | null;
  results: T[];
};

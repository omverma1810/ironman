export type Role = "FIELD" | "OPERATOR" | "ADMIN" | "FOUNDER" | "VIEWER" | "CUSTOMER";

export type Me = {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  roles: Role[];
};

export type JobKind = "PICKUP" | "DELIVERY";
export type JobStatus = "PENDING" | "EN_ROUTE" | "ARRIVED" | "DONE" | "FAILED";

export type JobLine = {
  garment_type: string;
  garment_type_name: string;
  declared_qty: number;
};

/** One stop on the rider's day, with everything needed at the door
 * (`GET /fulfilment/jobs/mine/`): the whole card is cached on the phone. */
export type JobCard = {
  id: string;
  route_day: string;
  /** The route day, as a calendar date (YYYY-MM-DD, India). */
  date: string;
  order: string;
  order_ref: string;
  order_status: string;
  payment_status: string;
  kind: JobKind;
  sequence: number;
  status: JobStatus;
  slot_start: string | null;
  slot_end: string | null;
  attempt_no: number;
  customer_name: string;
  customer_phone: string;
  apartment_name: string;
  address: string;
  special_instructions: string;
  lines: JobLine[];
  /** How many bags go to this door (deliveries). */
  bag_count: number;
};

export type DeclaredLine = { garment_type: string; qty: number };

export type OpType = "job.start" | "job.arrive" | "job.complete" | "job.fail";

/** An action the rider took, waiting to reach the server. */
export type QueuedOp = {
  client_op_id: string;
  op_type: OpType;
  job_id: string;
  payload: Record<string, unknown>;
  /** When the rider did it, by the phone's clock. */
  client_ts: string;
};

/** A photo waiting to be uploaded; the file lives in app storage until it is. */
export type QueuedProof = {
  id: string;
  job_id: string;
  uri: string;
  captured_at: string;
};

/** Something the server would not take. Kept until the rider has read it. */
export type SyncIssue = {
  id: string;
  job_id: string;
  order_ref: string;
  what: string;
  message: string;
  at: string;
};

export type OfflineOpResult = {
  client_op_id: string;
  op_type: string;
  status: "APPLIED" | "CONFLICT" | "REJECTED";
  result_detail: string;
};

export type CashBalance = { balance_minor: number };
export type HandoverRecipient = { id: string; full_name: string; email: string };
export type CashHandover = {
  id: string;
  to_user_name: string;
  declared_amount_minor: number;
  received_amount_minor: number | null;
  variance_minor: number;
  status: "PENDING" | "CONFIRMED";
  created_at: string;
};

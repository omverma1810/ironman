import { ApiError, type ApiErrorBody } from "./errors";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  accessToken?: string;
};

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  const url = new URL(
    path.startsWith("http") ? path : `${API_BASE_URL}${path}`
  );
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * The one call site for every request to the Django API. Session cookie
 * auth (console) works via `credentials: "include"` + the CSRF header;
 * JWT auth (customer/mobile) passes `accessToken`. Both are accepted
 * server-side (docs/04 §1).
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, params, idempotencyKey, signal, accessToken } = options;

  const bodyIsFormData = isFormData(body);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  // A FormData body sets its own multipart Content-Type (with boundary) —
  // letting fetch do that itself is why we skip the header here.
  if (body !== undefined && !bodyIsFormData) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  } else if (method !== "GET") {
    const csrf = getCsrfToken();
    if (csrf) headers["X-CSRFToken"] = csrf;
  }

  const response = await fetch(buildUrl(path, params), {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : bodyIsFormData ? body : JSON.stringify(body),
    signal,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    if (data && "error" in data) {
      throw new ApiError(response.status, data as ApiErrorBody);
    }
    throw new ApiError(response.status, {
      error: {
        code: "unknown_error",
        message: "Something went wrong. Please try again.",
        detail: null,
        field_errors: {},
        request_id: "",
        retryable: response.status >= 500,
      },
    });
  }

  return data as T;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

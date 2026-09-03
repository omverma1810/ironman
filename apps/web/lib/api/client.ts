import { ApiError, type ApiErrorBody } from "./errors";

// The API's real origin — always absolute, used for SSR, resolveMediaUrl,
// and normalizing any absolute URL the API itself hands back (see
// buildUrl below).
const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

// Console (Vercel) and API (Cloud Run) are on different domains, so a
// direct browser fetch is cross-site — a SameSite=None session/CSRF
// cookie there is exactly what mobile Safari (and increasingly other
// browsers) can drop unreliably right after it's set: `/me` succeeds,
// the very next request 401s with "Authentication credentials were not
// provided". In the browser, route through this app's own origin instead
// — next.config.ts's rewrite forwards it to API_ORIGIN server-side, so
// the cookie the browser actually sees is an ordinary same-site one.
// Only kicks in when NEXT_PUBLIC_API_BASE_URL is actually set (i.e. a
// real deployment) — local dev keeps talking to localhost:8000 directly,
// same-site already, no proxy needed.
const API_BASE_URL =
  typeof window !== "undefined" && process.env.NEXT_PUBLIC_API_BASE_URL ? "/api/v1" : API_ORIGIN;

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

/**
 * A file URL a serializer returns via Django's `FileField.url` (invoice/
 * credit-note PDFs, docs/08 batch 3.1) is host-relative (`/media/...`) —
 * it only resolves correctly when the page and the API share an origin.
 * Console and API are separate deployments, so it needs the API's own
 * origin prefixed before it's used as a link or download target.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${new URL(API_ORIGIN).origin}${url}`;
}

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  // A DRF cursor-paginated response's `next`/`previous` (common/pagination.py)
  // is an absolute URL built server-side against the API's own origin —
  // normalize it back to a path first so a "load more" fetch goes through
  // the same origin (and proxy, in production) as every other request,
  // rather than straight back to the API's real cross-site origin.
  const normalizedPath = path.startsWith(API_ORIGIN) ? path.slice(API_ORIGIN.length) : path;
  const full = normalizedPath.startsWith("http") ? normalizedPath : `${API_BASE_URL}${normalizedPath}`;
  const url = new URL(full, typeof window !== "undefined" ? window.location.origin : undefined);
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

/**
 * @ironman/api-client — the platform-agnostic half of the one call site
 * every request to the Django API goes through. `apps/web/lib/api/client.ts`
 * predates this package and layers its own cookie/CSRF handling on top of
 * the same contract for the console's session-auth flows; `apps/mobile`
 * has no cookies at all, so this version is JWT-bearer-only, with the
 * token supplied by an injected `getAccessToken` rather than read off
 * `document.cookie`. Both speak the same error envelope (docs/04 §2) so
 * a caller written against one reads identically against the other.
 */

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    detail: string | null;
    field_errors: Record<string, string[]>;
    request_id: string;
    retryable: boolean;
  };
};

export class ApiError extends Error {
  code: string;
  detail: string | null;
  fieldErrors: Record<string, string[]>;
  requestId: string;
  retryable: boolean;
  status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.error.code;
    this.detail = body.error.detail;
    this.fieldErrors = body.error.field_errors;
    this.requestId = body.error.request_id;
    this.retryable = body.error.retryable;
  }

  static isApiError(err: unknown): err is ApiError {
    return err instanceof ApiError;
  }
}

export type Paginated<T> = {
  next: string | null;
  previous: string | null;
  results: T[];
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export type ApiClientConfig = {
  /** The API's origin, e.g. "http://localhost:8000/api/v1" — no trailing slash. */
  baseUrl: string;
  /** Called before every request; return null when signed out. */
  getAccessToken: () => string | null | Promise<string | null>;
  /**
   * Called on a 401 for a request that carried a token. Returns a fresh
   * access token (the request is then retried once with it), null when the
   * session has been refused renewal (`onUnauthorized` follows), or throws
   * when renewal couldn't be attempted, e.g. offline (the session is kept and
   * the original 401 surfaces). Concurrent 401s share one call. Omit it and a
   * 401 goes straight to `onUnauthorized`.
   */
  refreshAccessToken?: () => Promise<string | null>;
  /** Called when a 401 can't be recovered, e.g. to sign the user out client-side. */
  onUnauthorized?: () => void;
  /** Override `fetch` (tests). */
  fetchImpl?: typeof fetch;
};

export type ApiClient = {
  request: <T>(path: string, options?: RequestOptions) => Promise<T>;
  get: <T>(path: string, params?: RequestOptions["params"]) => Promise<T>;
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => Promise<T>;
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => Promise<T>;
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => Promise<T>;
  delete: <T>(path: string, options?: RequestOptions) => Promise<T>;
};

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function buildUrl(baseUrl: string, path: string, params?: RequestOptions["params"]): string {
  const full = path.startsWith("http") ? path : `${baseUrl}${path}`;
  const url = new URL(full);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const { baseUrl, getAccessToken, refreshAccessToken, onUnauthorized } = config;
  const doFetch = config.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  let refreshing: Promise<string | null> | null = null;

  function refreshOnce(): Promise<string | null> {
    if (!refreshing) {
      refreshing = refreshAccessToken!().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function request<T>(
    path: string,
    options: RequestOptions = {},
    retried = false
  ): Promise<T> {
    const { method = "GET", body, params, idempotencyKey, signal } = options;

    const bodyIsFormData = isFormData(body);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined && !bodyIsFormData) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    const token = await getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await doFetch(buildUrl(baseUrl, path, params), {
      method,
      headers,
      body: body === undefined ? undefined : bodyIsFormData ? (body as FormData) : JSON.stringify(body),
      signal,
    });

    if (response.status === 401 && token) {
      // An expired access token is routine: renew it and replay the request
      // once. Only a request that carried a token can have expired (a wrong
      // OTP code is a 401 too, and isn't a reason to sign anyone out).
      if (refreshAccessToken && !retried) {
        let renewed: string | null | undefined;
        try {
          renewed = await refreshOnce();
        } catch {
          renewed = undefined; // couldn't try: keep the session
        }
        if (renewed) return request<T>(path, options, true);
        if (renewed === null) onUnauthorized?.();
      } else {
        onUnauthorized?.();
      }
    }

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

  return {
    request,
    get: (path, params) => request(path, { method: "GET", params }),
    post: (path, body, options) => request(path, { ...options, method: "POST", body }),
    patch: (path, body, options) => request(path, { ...options, method: "PATCH", body }),
    put: (path, body, options) => request(path, { ...options, method: "PUT", body }),
    delete: (path, options) => request(path, { ...options, method: "DELETE" }),
  };
}

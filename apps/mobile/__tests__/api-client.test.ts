import { ApiError, createApiClient } from "@ironman/api-client";

type Reply = { status: number; body?: unknown };

/** A fetch that answers from a script and remembers what it was asked. */
function scripted(replies: Reply[]) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({ url: String(url), auth: headers.Authorization ?? null });
    const reply = replies.shift() ?? { status: 500 };
    return {
      status: reply.status,
      ok: reply.status >= 200 && reply.status < 300,
      headers: { get: () => "application/json" },
      json: async () => reply.body ?? {},
    };
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const unauthorized: Reply = {
  status: 401,
  body: { error: { code: "not_authenticated", message: "Expired", detail: null, field_errors: {}, request_id: "r", retryable: false } },
};

function client(opts: {
  replies: Reply[];
  tokens?: { current: string | null };
  refresh?: () => Promise<string | null>;
  onUnauthorized?: () => void;
}) {
  const { fetchImpl, calls } = scripted(opts.replies);
  const tokens = opts.tokens ?? { current: "old" };
  const api = createApiClient({
    baseUrl: "http://api.test/v1",
    getAccessToken: () => tokens.current,
    refreshAccessToken: opts.refresh,
    onUnauthorized: opts.onUnauthorized,
    fetchImpl,
  });
  return { api, calls, tokens };
}

describe("token renewal", () => {
  it("renews an expired token and replays the request once", async () => {
    const tokens = { current: "old" as string | null };
    const { api, calls } = client({
      tokens,
      replies: [unauthorized, { status: 200, body: { ok: true } }],
      refresh: async () => {
        tokens.current = "new";
        return "new";
      },
    });
    await expect(api.get("/orders/")).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c.auth)).toEqual(["Bearer old", "Bearer new"]);
  });

  it("signs out when the renewal is refused", async () => {
    const onUnauthorized = jest.fn();
    const { api } = client({ replies: [unauthorized], refresh: async () => null, onUnauthorized });
    await expect(api.get("/orders/")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("keeps the session when renewal couldn't be tried (offline)", async () => {
    const onUnauthorized = jest.fn();
    const { api } = client({
      replies: [unauthorized],
      refresh: async () => {
        throw new TypeError("Network request failed");
      },
      onUnauthorized,
    });
    await expect(api.get("/orders/")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("shares one renewal between requests that fail together", async () => {
    const refresh = jest.fn(async () => "new");
    const tokens = { current: "old" as string | null };
    const { api, calls } = client({
      tokens,
      replies: [unauthorized, unauthorized, { status: 200, body: { n: 1 } }, { status: 200, body: { n: 2 } }],
      refresh,
    });
    await Promise.all([api.get("/a"), api.get("/b")]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(4);
  });

  it("replays only once: a second 401 after renewal signs out", async () => {
    const onUnauthorized = jest.fn();
    const { api, calls } = client({
      replies: [unauthorized, unauthorized],
      refresh: async () => "new",
      onUnauthorized,
    });
    await expect(api.get("/orders/")).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("leaves a 401 with no token alone: a wrong sign-in code is not an expired session", async () => {
    const onUnauthorized = jest.fn();
    const refresh = jest.fn(async () => "new");
    const { api } = client({
      tokens: { current: null },
      replies: [unauthorized],
      refresh,
      onUnauthorized,
    });
    await expect(api.post("/auth/otp/verify", {})).rejects.toBeInstanceOf(ApiError);
    expect(refresh).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

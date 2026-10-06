import { createApiClient } from "@ironman/api-client";
import { getAccessToken, getRefreshToken, setTokens, signOut } from "./auth-store";

// Same default apps/web/lib/api/client.ts uses for local dev. A real
// device (not a simulator) can't reach "localhost" on the dev machine —
// set EXPO_PUBLIC_API_BASE_URL to the machine's LAN IP for that case
// (Expo inlines EXPO_PUBLIC_* vars at build time, same mechanism as
// Next.js's own NEXT_PUBLIC_*).
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/**
 * Access tokens last 15 minutes; the refresh token lasts 30 days and rotates
 * on every use (the old one is blacklisted). Called by the client on a 401,
 * once however many requests failed together.
 */
async function refreshAccessToken(): Promise<string | null> {
  const refresh = await getRefreshToken();
  if (!refresh) return null; // nothing to renew with: signed out
  // A network failure throws (the client keeps the session and surfaces the
  // 401): being offline must not sign a rider out.
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (response.status >= 500) throw new Error("The server couldn't renew the session.");
  if (!response.ok) return null;
  const data = (await response.json()) as { access: string; refresh?: string };
  await setTokens({ access: data.access, refresh: data.refresh ?? refresh });
  return data.access;
}

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken,
  refreshAccessToken,
  // Reached only when the refresh token is also expired or revoked.
  onUnauthorized: signOut,
});

export { ApiError } from "@ironman/api-client";

import { createApiClient } from "@ironman/api-client";
import { getAccessToken, signOut } from "./auth-store";

// Same default apps/web/lib/api/client.ts uses for local dev. A real
// device (not a simulator) can't reach "localhost" on the dev machine —
// set EXPO_PUBLIC_API_BASE_URL to the machine's LAN IP for that case
// (Expo inlines EXPO_PUBLIC_* vars at build time, same mechanism as
// Next.js's own NEXT_PUBLIC_*).
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken,
  // A 401 here always means the refresh token has also expired or been
  // revoked — batch 8's slice doesn't implement refresh-token rotation
  // yet, so the only correct response is to sign out and let the root
  // layout's redirect send the user back to /login.
  onUnauthorized: signOut,
});

export { ApiError } from "@ironman/api-client";

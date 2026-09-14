/**
 * The persistence + pub-sub layer under useAuth() (lib/auth.tsx). Kept
 * separate from the React context so lib/api.ts's `onUnauthorized`
 * callback — which fires from inside a plain fetch, not a component —
 * can clear tokens and notify listeners without importing React.
 */
import * as SecureStore from "expo-secure-store";
import type { Me } from "./types";

const ACCESS_TOKEN_KEY = "ironman.accessToken";
const REFRESH_TOKEN_KEY = "ironman.refreshToken";
const USER_KEY = "ironman.user";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getStoredSession(): Promise<{ user: Me } | null> {
  const [accessToken, userJson] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(USER_KEY),
  ]);
  if (!accessToken || !userJson) return null;
  return { user: JSON.parse(userJson) as Me };
}

export async function setSession(tokens: { access: string; refresh: string }, user: Me) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.access),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refresh),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
  ]);
  notify();
}

export async function signOut() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
  notify();
}

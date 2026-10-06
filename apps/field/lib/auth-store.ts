/**
 * The persistence + pub-sub layer under useAuth() (lib/auth.tsx). Kept
 * separate from the React context so lib/api.ts's refresh and
 * `onUnauthorized` callbacks — which fire from inside a plain fetch, not a
 * component — can read tokens, clear them and notify listeners without
 * importing React.
 */
import { deleteItem, getItem, setItem } from "./storage";
import type { Me } from "./types";

const ACCESS_TOKEN_KEY = "ironman.field.accessToken";
const REFRESH_TOKEN_KEY = "ironman.field.refreshToken";
const USER_KEY = "ironman.field.user";

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
  return getItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_TOKEN_KEY);
}

export async function getStoredSession(): Promise<{ user: Me } | null> {
  const [accessToken, userJson] = await Promise.all([getItem(ACCESS_TOKEN_KEY), getItem(USER_KEY)]);
  if (!accessToken || !userJson) return null;
  try {
    return { user: JSON.parse(userJson) as Me };
  } catch {
    return null;
  }
}

export async function setSession(tokens: { access: string; refresh: string }, user: Me) {
  await Promise.all([
    setItem(ACCESS_TOKEN_KEY, tokens.access),
    setItem(REFRESH_TOKEN_KEY, tokens.refresh),
    setItem(USER_KEY, JSON.stringify(user)),
  ]);
  notify();
}

/** Store a renewed token pair without notifying: the user hasn't changed. */
export async function setTokens(tokens: { access: string; refresh: string }) {
  await Promise.all([
    setItem(ACCESS_TOKEN_KEY, tokens.access),
    setItem(REFRESH_TOKEN_KEY, tokens.refresh),
  ]);
}

export async function updateStoredUser(user: Me) {
  await setItem(USER_KEY, JSON.stringify(user));
  notify();
}

export async function signOut() {
  await Promise.all([
    deleteItem(ACCESS_TOKEN_KEY),
    deleteItem(REFRESH_TOKEN_KEY),
    deleteItem(USER_KEY),
  ]);
  notify();
}

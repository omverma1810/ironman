/**
 * The persistence + pub-sub layer under useCustomerAuth() (customer-auth.tsx).
 * JWT (docs/04 §3.1), not the console's session cookie — a customer's
 * account area stays signed in across visits via localStorage, mirroring
 * apps/mobile's lib/auth-store.ts (SecureStore there, localStorage here).
 */
import type { Me } from "./api/types";

const ACCESS_TOKEN_KEY = "ironman.customer.accessToken";
const REFRESH_TOKEN_KEY = "ironman.customer.refreshToken";
const USER_KEY = "ironman.customer.user";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return safeGet(ACCESS_TOKEN_KEY);
}

export function getStoredSession(): { accessToken: string; user: Me } | null {
  const accessToken = safeGet(ACCESS_TOKEN_KEY);
  const userJson = safeGet(USER_KEY);
  if (!accessToken || !userJson) return null;
  try {
    return { accessToken, user: JSON.parse(userJson) as Me };
  } catch {
    return null;
  }
}

export function setSession(tokens: { access: string; refresh: string }, user: Me) {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Private browsing / storage disabled — the session just won't
    // survive a reload; nothing else in this flow depends on it.
  }
  notify();
}

export function signOut() {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // Same as above.
  }
  notify();
}

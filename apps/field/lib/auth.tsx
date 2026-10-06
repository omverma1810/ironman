import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";
import { unregisterPush } from "./push";
import { getRefreshToken, getStoredSession, setSession, signOut as clearSession, subscribe } from "./auth-store";
import type { Me } from "./types";

type AuthState = {
  user: Me | null;
  isLoading: boolean;
  /** Email and password, plus the authenticator code where the account has one. */
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  /** Signs out. What the rider did offline stays on the phone for their next sign-in. */
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

type TokenResponse = { access: string; refresh: string; user: Me };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadSession() {
    const session = await getStoredSession();
    setUser(session?.user ?? null);
    setIsLoading(false);
  }

  useEffect(() => {
    loadSession();
    // api.ts clears the session from outside React when the server refuses to
    // renew it; this keeps the screens in step.
    return subscribe(loadSession);
  }, []);

  async function login(email: string, password: string, totpCode?: string) {
    const response = await api.post<TokenResponse>("/auth/staff/token", {
      email: email.trim().toLowerCase(),
      password,
      ...(totpCode ? { totp_code: totpCode } : {}),
    });
    await setSession({ access: response.access, refresh: response.refresh }, response.user);
    setUser(response.user);
  }

  async function logout() {
    // While the token that authorises it still exists.
    await unregisterPush();
    try {
      await api.post("/auth/logout", { refresh: await getRefreshToken() });
    } catch {
      // Offline: the token simply expires; the phone is signed out regardless.
    }
    await clearSession();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export { ApiError };

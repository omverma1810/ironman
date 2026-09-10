import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";
import { getStoredSession, setSession, signOut as clearSession, subscribe } from "./auth-store";
import type { Me } from "./types";

type AuthState = {
  user: Me | null;
  isLoading: boolean;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

type OtpVerifyResponse = { access: string; refresh: string; user: Me; created: boolean };

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
    // Re-syncs this component's state after api.ts's `onUnauthorized`
    // clears the store from outside React (a 401 on any screen's fetch,
    // not just one triggered by this provider).
    return subscribe(loadSession);
  }, []);

  async function requestOtp(phone: string) {
    await api.post("/auth/otp/request", { phone, purpose: "LOGIN" });
  }

  async function verifyOtp(phone: string, code: string) {
    const response = await api.post<OtpVerifyResponse>("/auth/otp/verify", { phone, code });
    await setSession({ access: response.access, refresh: response.refresh }, response.user);
    setUser(response.user);
  }

  async function logout() {
    await clearSession();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, requestOtp, verifyOtp, logout }}>
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

"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authApi } from "./api/endpoints";
import { ApiError } from "./api/errors";
import {
  getStoredSession,
  setSession,
  signOut as clearSession,
  subscribe,
} from "./customer-auth-store";
import type { Me } from "./api/types";

type CustomerAuthState = {
  user: Me | null;
  accessToken: string | null;
  isLoading: boolean;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string, fullName?: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  logout: () => void;
};

const CustomerAuthContext = createContext<CustomerAuthState | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function loadSession() {
    const session = getStoredSession();
    setUser(session?.user ?? null);
    setAccessToken(session?.accessToken ?? null);
    setIsLoading(false);
  }

  useEffect(() => {
    loadSession();
    // Re-syncs after `signOut` is called from outside React (e.g. a 401
    // on some other tab's fetch clearing the shared localStorage session).
    return subscribe(loadSession);
  }, []);

  async function requestOtp(phone: string) {
    await authApi.otpRequest(phone, "LOGIN");
  }

  async function verifyOtp(phone: string, code: string, fullName?: string) {
    const response = await authApi.otpVerify(phone, code, fullName);
    setSession({ access: response.access, refresh: response.refresh }, response.user);
    setUser(response.user);
    setAccessToken(response.access);
  }

  async function refreshMe() {
    if (!accessToken) return;
    try {
      const me = await authApi.me(accessToken);
      setUser(me);
    } catch (err) {
      // The 15-minute access token expired (no refresh-rotation flow yet
      // for this surface, same simplification apps/mobile's lib/api.ts
      // documents) — sign out so the account area prompts to verify again
      // rather than showing stale/broken state.
      if (ApiError.isApiError(err) && err.status === 401) {
        clearSession();
      }
    }
  }

  function logout() {
    clearSession();
  }

  return (
    <CustomerAuthContext.Provider
      value={{ user, accessToken, isLoading, requestOtp, verifyOtp, refreshMe, logout }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthState {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth must be used within a CustomerAuthProvider");
  return ctx;
}

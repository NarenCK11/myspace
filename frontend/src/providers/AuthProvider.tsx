import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, onAuthExpired, refreshAccessToken, setAccessToken } from "@/lib/api";
import type { TokenResponse, User } from "@/types/api";

interface AuthContextValue {
  user: User | null;
  status: "loading" | "authenticated" | "anonymous";
  login: (loginId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");

  /*
   * On boot there is no access token in memory, but the browser may still hold
   * a valid refresh cookie from a previous visit. One silent refresh restores
   * the session without asking for the password again.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await refreshAccessToken();
      if (cancelled) return;
      if (!token) {
        setStatus("anonymous");
        return;
      }
      try {
        const { data } = await api.get<User>("/auth/me");
        if (cancelled) return;
        setUserState(data);
        setStatus("authenticated");
      } catch {
        if (!cancelled) setStatus("anonymous");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // The API client tells us when a refresh finally failed mid-session.
  useEffect(() => {
    onAuthExpired(() => {
      setAccessToken(null);
      setUserState(null);
      setStatus("anonymous");
    });
  }, []);

  const login = useCallback(async (loginId: string, password: string) => {
    const { data } = await api.post<TokenResponse>("/auth/login", {
      login_id: loginId,
      password,
    });
    setAccessToken(data.access_token);
    setUserState(data.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setAccessToken(null);
      setUserState(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout, setUser: setUserState }),
    [user, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

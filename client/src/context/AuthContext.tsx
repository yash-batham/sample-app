import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setAuthToken, AUTH_STORAGE_KEY } from "../api/client";
import type { Staff } from "../types";

interface AuthContextValue {
  staff: Staff | null;
  token: string | null;
  loading: boolean;
  login: (name: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(AUTH_STORAGE_KEY));
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAuthToken(token);
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<Staff>("/api/auth/me")
      .then((res) => setStaff(res.data))
      .catch(() => {
        setToken(null);
        localStorage.removeItem(AUTH_STORAGE_KEY);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function login(name: string, password: string) {
    const res = await api.post("/api/auth/login", { name, password });
    localStorage.setItem(AUTH_STORAGE_KEY, res.data.access_token);
    setAuthToken(res.data.access_token);
    setStaff(res.data.staff);
    setToken(res.data.access_token);
  }

  function logout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthToken(null);
    setStaff(null);
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ staff, token, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

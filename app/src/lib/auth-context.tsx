import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "@/lib/api";
import type { User, AuthMeResponse, LoginResponse } from "@/types/api";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string, turnstileToken: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check session on mount
  useEffect(() => {
    let cancelled = false;
    api
      .get<AuthMeResponse>("/auth/me")
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch((e) => {
        if (!cancelled) {
          setUser(null);
          if (e instanceof ApiError && e.status === 401) {
            const pub = ["/login", "/setup", "/change-password", "/invite/accept"];
            const isPublic =
              pub.some((p) => window.location.pathname.startsWith(p)) ||
              window.location.pathname.startsWith("/share/");
            if (!isPublic) {
              const here = window.location.pathname + window.location.search;
              window.location.href = "/login?returnTo=" + encodeURIComponent(here);
            }
          }
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(
    email: string,
    password: string,
    turnstileToken: string
  ): Promise<void> {
    const data = await api.post<LoginResponse>("/auth/login", {
      email,
      password,
      turnstileToken,
    });

    // Fetch the full user profile (login response only returns id/email/role/display_name)
    const meData = await api.get<AuthMeResponse>("/auth/me");
    setUser(meData.user);

    if (data.must_change_pw) {
      window.location.href = "/change-password";
    }
  }

  async function logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore errors — clear user regardless
    }
    setUser(null);
  }

  async function refreshUser(): Promise<void> {
    const data = await api.get<AuthMeResponse>("/auth/me");
    setUser(data.user);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}

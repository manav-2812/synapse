import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api/auth";
import {
  clearTokens,
  getToken,
  setUnauthorizedHandler,
} from "../api/client";
import type { UserMeResponse } from "../types/api";

interface AuthState {
  user: UserMeResponse | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Bounce to /login when the session truly expires (fired by the API client).
    setUnauthorizedHandler(() => {
      setUser(null);
      const path = window.location.pathname;
      if (!path.endsWith("/login") && !path.endsWith("/signup")) {
        localStorage.setItem("synapse_redirect", path);
        navigate("/login");
      }
    });

    let cancelled = false;
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await authApi.me();
        if (!cancelled) setUser(me);
      } catch {
        clearTokens();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const login = async (email: string, password: string) => {
    await authApi.login({ email, password });
    setUser(await authApi.me());
  };

  const signup = async (
    email: string,
    password: string,
    fullName: string,
  ) => {
    await authApi.signup({ email, password, full_name: fullName });
    setUser(await authApi.me());
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
    navigate("/login");
  };

  const refreshUser = async () => {
    try {
      setUser(await authApi.me());
    } catch {
      clearTokens();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, signup, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

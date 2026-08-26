import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api/auth";
import { authenticateWithPasskey } from "../api/passkey";
import {
  clearTokens,
  getToken,
  setUnauthorizedHandler,
} from "../api/client";
import type { SignupResponse, UserMeResponse } from "../types/api";

interface AuthState {
  user: UserMeResponse | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithPasskey: () => Promise<void>;
  signup: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<SignupResponse>;
  verifyEmail: (token: string) => Promise<void>;
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
      if (!path.endsWith("/login") && !path.endsWith("/signup") && !path.endsWith("/verify-email")) {
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

  const login = useCallback(async (email: string, password: string) => {
    await authApi.login({ email, password });
    setUser(await authApi.me());
  }, []);

  const loginWithPasskey = useCallback(async () => {
    await authenticateWithPasskey();
    setUser(await authApi.me());
  }, []);

  const signup = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
    ): Promise<SignupResponse> => {
      return await authApi.signup({ email, password, full_name: fullName });
    },
    []
  );

  const verifyEmail = useCallback(async (token: string) => {
    await authApi.verifyEmail(token);
    setUser(await authApi.me());
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    navigate("/login");
  }, [navigate]);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await authApi.me());
    } catch {
      clearTokens();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, loginWithPasskey, signup, verifyEmail, logout, refreshUser }}
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

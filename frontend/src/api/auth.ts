import { request, setTokens, getRefresh, clearTokens, getToken, BASE } from "./client";
import type {
  LoginRequest,
  SignupRequest,
  TokenResponse,
  UserMeResponse,
  UserUpdateRequest,
} from "../types/api";

export const authApi = {
  async signup(payload: SignupRequest): Promise<TokenResponse> {
    const data = await request<TokenResponse>("/auth/signup", {
      method: "POST",
      body: payload,
    });
    setTokens(data.access_token, data.refresh_token);
    return data;
  },
  async login(payload: LoginRequest): Promise<TokenResponse> {
    const data = await request<TokenResponse>("/auth/login", {
      method: "POST",
      body: payload,
    });
    setTokens(data.access_token, data.refresh_token);
    return data;
  },
  async me(): Promise<UserMeResponse> {
    return request<UserMeResponse>("/users/me");
  },
  async updateMe(payload: UserUpdateRequest): Promise<UserMeResponse> {
    return request<UserMeResponse>("/users/me", { method: "PATCH", body: payload });
  },
  async uploadAvatar(file: File): Promise<UserMeResponse> {
    const fd = new FormData();
    fd.append("file", file);
    const token = getToken();
    const res = await fetch(`${BASE}/users/me/avatar`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      let msg = `Upload failed (${res.status})`;
      try {
        const d = (await res.json()) as { error?: { message?: string }; detail?: string };
        msg = d?.error?.message || d?.detail || msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return (await res.json()) as UserMeResponse;
  },
  async logout(): Promise<void> {
    const refresh = getRefresh();
    try {
      if (refresh) {
        await request("/auth/logout", {
          method: "POST",
          body: { refresh_token: refresh },
        });
      }
    } catch {
      /* ignore logout errors */
    } finally {
      clearTokens();
    }
  },
};

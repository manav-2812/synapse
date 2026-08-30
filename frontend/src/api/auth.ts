import { request, setTokens, getRefresh, clearTokens, getToken, BASE } from "./client";
import type {
  LoginRequest,
  SignupRequest,
  SignupResponse,
  TokenResponse,
  UserMeResponse,
  UserUpdateRequest,
} from "../types/api";

export const authApi = {
  async signup(payload: SignupRequest): Promise<SignupResponse> {
    return request<SignupResponse>("/auth/signup", {
      method: "POST",
      body: payload,
    });
  },
  async verifyEmail(token: string): Promise<TokenResponse> {
    const data = await request<TokenResponse>("/auth/verify-email", {
      method: "POST",
      body: { token },
    });
    setTokens(data.access_token, data.refresh_token);
    return data;
  },
  async resendVerification(email: string): Promise<{ message: string; dev_verify_link?: string }> {
    return request<{ message: string; dev_verify_link?: string }>("/auth/resend-verification", {
      method: "POST",
      body: { email },
    });
  },
  async login(payload: LoginRequest): Promise<TokenResponse> {
    const data = await request<TokenResponse>("/auth/login", {
      method: "POST",
      body: payload,
    });
    setTokens(data.access_token, data.refresh_token);
    return data;
  },
  async loginWithGoogle(payload: { code?: string; redirect_uri?: string; credential?: string }): Promise<TokenResponse> {
    const data = await request<TokenResponse>("/auth/oauth/google", {
      method: "POST",
      body: payload,
    });
    setTokens(data.access_token, data.refresh_token);
    return data;
  },
  async loginWithMicrosoft(payload: { code: string; redirect_uri?: string; code_verifier?: string }): Promise<TokenResponse> {
    const data = await request<TokenResponse>("/auth/oauth/microsoft", {
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
  async forgotPassword(email: string): Promise<{ message: string; dev_reset_link?: string }> {
    return request<{ message: string; dev_reset_link?: string }>("/auth/forgot-password", {
      method: "POST",
      body: { email },
    });
  },
  async resetPassword(token: string, new_password: string): Promise<{ message: string }> {
    return request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: { token, new_password },
    });
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
  async exportData(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/users/me/export");
  },
  async deleteAccount(): Promise<{ message: string; deleted: boolean }> {
    const res = await request<{ message: string; deleted: boolean }>("/users/me", {
      method: "DELETE",
    });
    clearTokens();
    return res;
  },
};

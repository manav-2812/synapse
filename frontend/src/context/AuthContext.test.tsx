import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("../api/auth", () => ({
  authApi: {
    me: vi.fn(),
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    updateMe: vi.fn(),
    uploadAvatar: vi.fn(),
  },
}));

import { authApi } from "../api/auth";

function Probe() {
  const { user, loading, login } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.email : "none"}</span>
      <button onClick={() => login("a@b.com", "pw")}>login</button>
    </div>
  );
}

describe("AuthContext / useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has no user and finishes loading when there is no token", async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false"),
    );
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("login() resolves the user via /users/me", async () => {
    (authApi.login as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      access_token: "a",
      refresh_token: "r",
    });
    (authApi.me as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      email: "a@b.com",
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("login"));

    await waitFor(() =>
      expect(screen.getByTestId("user").textContent).toBe("a@b.com"),
    );
    expect(authApi.login).toHaveBeenCalledWith({ email: "a@b.com", password: "pw" });
    expect(authApi.me).toHaveBeenCalled();
  });
});

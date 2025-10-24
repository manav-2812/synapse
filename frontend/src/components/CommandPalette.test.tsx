import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { CommandPalette } from "./CommandPalette";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function openPalette() {
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
}

describe("CommandPalette", () => {
  it("opens with Ctrl/Cmd+K and closes on Escape", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AuthProvider>
          <CommandPalette />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    openPalette();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Command palette");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("filters commands and navigates on Enter", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AuthProvider>
          <CommandPalette />
          <LocationProbe />
        </AuthProvider>
      </MemoryRouter>,
    );
    openPalette();
    const input = await screen.findByLabelText("Command search");

    fireEvent.change(input, { target: { value: "chat" } });
    expect(await screen.findByText("Go to Chat")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe("/chat"),
    );
  });
});

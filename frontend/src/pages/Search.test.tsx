import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import Search from "./Search";

describe("Search Page", () => {
  it("renders the search header and hero input", async () => {
    render(
      <MemoryRouter initialEntries={["/search"]}>
        <AuthProvider>
          <Search />
        </AuthProvider>
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(/Search documents, notes, chats/i);
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "machine learning" } });
    expect(input).toHaveValue("machine learning");
  });

  it("filters tabs when clicked", async () => {
    render(
      <MemoryRouter initialEntries={["/search"]}>
        <AuthProvider>
          <Search />
        </AuthProvider>
      </MemoryRouter>
    );

    const docTab = screen.getByRole("button", { name: /^Documents/i });
    expect(docTab).toBeInTheDocument();
    fireEvent.click(docTab);
    expect(docTab).toHaveClass("active");
  });
});

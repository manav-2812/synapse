import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { GenLoading } from "./GenLoading";

describe("GenLoading", () => {
  it("renders with default steps and pulse orb", () => {
    const { container } = render(<GenLoading />);
    expect(screen.getByText("Retrieving relevant sections…")).toBeTruthy();
    expect(container.querySelector(".gen-loading-orb")).toBeTruthy();
    expect(container.querySelectorAll(".gen-sk-line").length).toBe(3);
  });

  it("renders custom label and custom steps", () => {
    render(
      <GenLoading
        label="Generating Quiz"
        steps={["Analyzing documents…", "Composing questions…"]}
      />
    );
    expect(screen.getByText("Generating Quiz")).toBeTruthy();
    expect(screen.getByText("Analyzing documents…")).toBeTruthy();
  });

  it("cycles through steps over time", () => {
    vi.useFakeTimers();
    render(
      <GenLoading
        steps={["Step 1", "Step 2", "Step 3"]}
      />
    );
    expect(screen.getByText("Step 1")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2700);
    });

    expect(screen.getByText("Step 2")).toBeTruthy();
    vi.useRealTimers();
  });
});

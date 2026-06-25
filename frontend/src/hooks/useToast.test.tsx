import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "./useToast";

function Harness() {
  const { toast } = useToast();
  return (
    <button onClick={() => toast("success", "Saved", "Document uploaded")}>show</button>
  );
}

describe("useToast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders a toast and auto-dismisses after 4500ms", () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("show"));
    expect(screen.getByText("Document uploaded")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("toast-success");

    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(screen.queryByText("Document uploaded")).not.toBeInTheDocument();
  });

  it("supports multiple stacked toasts", () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("show"));
    fireEvent.click(screen.getByText("show"));
    expect(screen.getAllByText("Document uploaded")).toHaveLength(2);
  });
});

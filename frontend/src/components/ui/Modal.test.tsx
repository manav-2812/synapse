import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(<Modal open={false} onClose={() => {}} title="Hi">body</Modal>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders title + body and is labelled by the title", () => {
    render(
      <Modal open onClose={() => {}} title="Confirm">
        Are you sure?
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Confirm");
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="X">body</Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the overlay is clicked", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="X">body</Modal>);
    fireEvent.click(screen.getByRole("dialog").parentElement as Element);
    expect(onClose).toHaveBeenCalled();
  });
});

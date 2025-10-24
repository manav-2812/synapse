import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Skeleton, SkeletonCard } from "./Skeleton";

describe("Skeleton", () => {
  it("renders a decorative placeholder with the given size", () => {
    render(<Skeleton width="50%" height="20px" />);
    const el = screen.getByText("", { selector: ".skeleton" });
    expect(el).toBeInTheDocument();
    expect(el).toHaveStyle({ width: "50%", height: "20px" });
    expect(el).toHaveAttribute("aria-hidden", "true");
  });

  it("renders a stack of skeleton cards", () => {
    const { container } = render(<SkeletonCard count={2} />);
    expect(container.querySelectorAll(".card").length).toBe(2);
  });
});

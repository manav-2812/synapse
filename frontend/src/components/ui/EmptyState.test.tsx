import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";
import { Button } from "./Button";

describe("EmptyState", () => {
  it("renders title and hint", () => {
    render(<EmptyState icon="doc" title="No documents yet" hint="Upload a PDF to begin" />);
    expect(screen.getByText("No documents yet")).toBeInTheDocument();
    expect(screen.getByText("Upload a PDF to begin")).toBeInTheDocument();
  });

  it("renders an action CTA when provided", () => {
    render(
      <EmptyState title="Nothing here" action={<Button>Upload</Button>} />,
    );
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  it("applies the accent tone class", () => {
    const { container } = render(<EmptyState title="T" tone="accent" />);
    expect(container.querySelector(".tone-accent")).toBeInTheDocument();
  });
});

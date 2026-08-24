import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders basic paragraphs with proper className", () => {
    const { container } = render(
      <MarkdownContent>{"This is a test paragraph.\n\nSecond paragraph."}</MarkdownContent>
    );
    const paragraphs = container.querySelectorAll(".md-p");
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0].textContent).toContain("This is a test paragraph.");
  });

  it("renders heading hierarchy properly", () => {
    const { container } = render(
      <MarkdownContent>{"# Heading 1\n## Heading 2\n### Heading 3\n#### Heading 4"}</MarkdownContent>
    );
    expect(container.querySelector(".md-h1")?.textContent).toBe("Heading 1");
    expect(container.querySelector(".md-h2")?.textContent).toBe("Heading 2");
    expect(container.querySelector(".md-h3")?.textContent).toBe("Heading 3");
    expect(container.querySelector(".md-h4")?.textContent).toBe("Heading 4");
  });

  it("renders unordered and ordered lists with custom classes", () => {
    const { container } = render(
      <MarkdownContent>{"- Item 1\n- Item 2\n\n1. Step A\n2. Step B"}</MarkdownContent>
    );
    expect(container.querySelector(".md-ul")).toBeTruthy();
    expect(container.querySelectorAll(".md-ul .md-li").length).toBe(2);
    expect(container.querySelector(".md-ol")).toBeTruthy();
    expect(container.querySelectorAll(".md-ol .md-li").length).toBe(2);
  });

  it("converts [Source N] and [1] citation tags into styled citation pills", () => {
    const { container } = render(
      <MarkdownContent>
        {"According to the document [Source 1], the reaction is exothermic [2]."}
      </MarkdownContent>
    );
    const pills = container.querySelectorAll(".md-cite-pill");
    expect(pills.length).toBe(2);
    expect(pills[0].textContent).toBe("Source 1");
    expect(pills[1].textContent).toBe("Source 2");
  });

  it("converts citation tags inside list items into styled pills", () => {
    const { container } = render(
      <MarkdownContent>
        {"- Key takeaway [Source 3]\n- Another point [4]"}
      </MarkdownContent>
    );
    const pills = container.querySelectorAll(".md-cite-pill");
    expect(pills.length).toBe(2);
    expect(pills[0].textContent).toBe("Source 3");
    expect(pills[1].textContent).toBe("Source 4");
  });

  it("renders inline code and fenced code blocks", () => {
    const { container } = render(
      <MarkdownContent>
        {"Use `console.log()` here:\n\n```javascript\nconst x = 42;\n```"}
      </MarkdownContent>
    );
    expect(container.querySelector(".md-inline-code")?.textContent).toBe("console.log()");
    expect(container.querySelector(".md-code-wrapper")).toBeTruthy();
    expect(container.querySelector(".md-code-lang")?.textContent).toBe("javascript");
  });

  it("renders tables properly with GFM support", () => {
    const { container } = render(
      <MarkdownContent>
        {"| Feature | Status |\n|---|---|\n| Chat | Done |\n| Quiz | Done |"}
      </MarkdownContent>
    );
    expect(container.querySelector(".md-table-wrapper")).toBeTruthy();
    expect(container.querySelectorAll(".md-th").length).toBe(2);
    expect(container.querySelectorAll(".md-td").length).toBe(4);
  });

  it("displays streaming cursor when isStreaming is true", () => {
    const { container } = render(
      <MarkdownContent isStreaming={true}>
        {"Generating text right now"}
      </MarkdownContent>
    );
    expect(container.querySelector(".streaming-cursor")).toBeTruthy();
  });

  it("does not display streaming cursor when isStreaming is false", () => {
    const { container } = render(
      <MarkdownContent isStreaming={false}>
        {"Completed text response"}
      </MarkdownContent>
    );
    expect(container.querySelector(".streaming-cursor")).toBeNull();
  });
});

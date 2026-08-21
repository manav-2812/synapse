import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { useEffect, useRef, type ReactNode } from "react";

// Highlight.js — loaded lazily so we don't pay the bundle cost unless a code
// block is actually rendered.  We pick only the languages that matter for a
// study-assistant context (Python, JS/TS, SQL, bash, JSON, diff).
let hljs: typeof import("highlight.js").default | null = null;
async function getHljs() {
  if (hljs) return hljs;
  const mod = await import("highlight.js/lib/core");
  hljs = mod.default;
  const [py, js, ts, sql, bash, json, diff, xml, css] = await Promise.all([
    import("highlight.js/lib/languages/python"),
    import("highlight.js/lib/languages/javascript"),
    import("highlight.js/lib/languages/typescript"),
    import("highlight.js/lib/languages/sql"),
    import("highlight.js/lib/languages/bash"),
    import("highlight.js/lib/languages/json"),
    import("highlight.js/lib/languages/diff"),
    import("highlight.js/lib/languages/xml"),
    import("highlight.js/lib/languages/css"),
  ]);
  hljs.registerLanguage("python", py.default);
  hljs.registerLanguage("javascript", js.default);
  hljs.registerLanguage("typescript", ts.default);
  hljs.registerLanguage("sql", sql.default);
  hljs.registerLanguage("bash", bash.default);
  hljs.registerLanguage("shell", bash.default);
  hljs.registerLanguage("json", json.default);
  hljs.registerLanguage("diff", diff.default);
  hljs.registerLanguage("xml", xml.default);
  hljs.registerLanguage("html", xml.default);
  hljs.registerLanguage("css", css.default);
  return hljs;
}

/** Highlight a <code> element in-place after mount. */
function CodeBlock({
  language,
  children,
}: {
  language: string | null;
  children: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getHljs().then((hl) => {
      if (cancelled || !ref.current) return;
      if (language && hl.getLanguage(language)) {
        ref.current.innerHTML = hl.highlight(children, { language }).value;
      } else {
        ref.current.innerHTML = hl.highlightAuto(children).value;
      }
      ref.current.classList.add("hljs");
    });
    return () => {
      cancelled = true;
    };
  }, [children, language]);

  return (
    <div className="md-code-wrapper">
      {language && <span className="md-code-lang">{language}</span>}
      <pre className="md-pre">
        <code ref={ref} className={`md-code${language ? ` language-${language}` : ""}`}>
          {children}
        </code>
      </pre>
    </div>
  );
}

/**
 * Replace [Source N] / [1] / [^1] patterns with pill-badge spans so citations
 * get a distinct visual treatment in the rendered bubble.
 */
const CITE_SPLIT = /(\[(?:Source\s+)?\^?\d+\])/gi;
const CITE_TEST = /^\[(?:Source\s+)?\^?\d+\]$/i;

function renderWithCitationPills(text: string): ReactNode[] {
  const parts = text.split(CITE_SPLIT);
  return parts.map((part, i) =>
    CITE_TEST.test(part) ? (
      <span key={i} className="md-cite-pill">
        {part}
      </span>
    ) : (
      part
    )
  );
}

function processChildrenWithCitations(children: ReactNode): ReactNode {
  if (Array.isArray(children)) {
    return children
      .flatMap((child, i) =>
        typeof child === "string"
          ? renderWithCitationPills(child).map((node, j) => ({ key: `${i}-${j}`, node }))
          : [{ key: String(i), node: child }]
      )
      .map(({ key, node }) => <span key={key}>{node}</span>);
  }
  if (typeof children === "string") {
    return renderWithCitationPills(children);
  }
  return children;
}

// Re-used renderer map for react-markdown
const components: Components = {
  // Fenced code blocks
  code({ className, children, ...props }) {
    const isInline = !className && !String(children).includes("\n");
    const match = /language-(\w+)/.exec(className ?? "");
    const lang = match ? match[1] : null;
    const code = String(children).replace(/\n$/, "");

    if (isInline) {
      return <code className="md-inline-code" {...props}>{children}</code>;
    }
    return <CodeBlock language={lang}>{code}</CodeBlock>;
  },

  // Paragraphs — apply citation pill treatment to any plain-text children
  p({ children }) {
    return <p className="md-p">{processChildrenWithCitations(children)}</p>;
  },

  // Headings with clear visual hierarchy
  h1({ children }) { return <h1 className="md-h md-h1">{children}</h1>; },
  h2({ children }) { return <h2 className="md-h md-h2">{children}</h2>; },
  h3({ children }) { return <h3 className="md-h md-h3">{children}</h3>; },
  h4({ children }) { return <h4 className="md-h md-h4">{children}</h4>; },

  // Lists
  ul({ children }) { return <ul className="md-ul">{children}</ul>; },
  ol({ children }) { return <ol className="md-ol">{children}</ol>; },
  li({ children }) { return <li className="md-li">{processChildrenWithCitations(children)}</li>; },

  // Blockquotes
  blockquote({ children }) {
    return <blockquote className="md-blockquote">{children}</blockquote>;
  },

  // Horizontal rules
  hr() { return <hr className="md-hr" />; },

  // Strong / em
  strong({ children }) { return <strong className="md-strong">{children}</strong>; },
  em({ children }) { return <em className="md-em">{children}</em>; },

  // Links — open external links in new tab
  a({ href, children }) {
    return (
      <a
        href={href}
        className="md-link"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },

  // Tables (GFM)
  table({ children }) {
    return (
      <div className="md-table-wrapper">
        <table className="md-table">{children}</table>
      </div>
    );
  },
  thead({ children }) { return <thead className="md-thead">{children}</thead>; },
  tbody({ children }) { return <tbody>{children}</tbody>; },
  tr({ children }) { return <tr className="md-tr">{children}</tr>; },
  th({ children }) { return <th className="md-th">{children}</th>; },
  td({ children }) { return <td className="md-td">{children}</td>; },

  // Text nodes — intercept to render citation pills
  // react-markdown passes text through the 'text' renderer
  // We handle citation pills in the paragraph renderer for simplicity.
};

interface MarkdownContentProps {
  children: string;
  className?: string;
  /** Show a blinking cursor at the end (while the model is still streaming) */
  isStreaming?: boolean;
}

/**
 * Renders an assistant message with proper markdown formatting:
 * headings, lists, code blocks with syntax highlighting, bold/em,
 * tables, blockquotes, and [Source N] citation pills.
 * When isStreaming=true a blinking cursor is appended to the last line.
 */
export function MarkdownContent({ children, className, isStreaming }: MarkdownContentProps) {
  return (
    <div className={`md-content${className ? ` ${className}` : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
      {isStreaming && (
        <span
          className="streaming-cursor"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

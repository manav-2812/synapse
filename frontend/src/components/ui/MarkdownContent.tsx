import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SourceResponse } from "../../types/api";

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
 * Replace [Source N] / 【Source N】 / [1] / 【1】 / [^1] patterns with pill-badge spans so citations
 * get a distinct visual treatment in the rendered bubble. Supports both with/without spaces.
 */
const CITE_SPLIT = /(\[(?:Source\s*)?\^?\d+\]|【(?:Source\s*)?\^?\d+】)/gi;
const CITE_TEST = /^(\[(?:Source\s*)?\^?\d+\]|【(?:Source\s*)?\^?\d+】)$/i;

function getSourceIndex(label: string): number | null {
  const match = label.match(/\d+/);
  return match ? Number(match[0]) - 1 : null;
}

function CitationPill({
  label,
  source,
  onClick,
}: {
  label: string;
  source?: SourceResponse;
  onClick?: (source: SourceResponse) => void;
}) {
  const [open, setOpen] = useState(false);
  const sourceNumber = getSourceIndex(label);
  const isWeb = source?.source_type === "web";
  const displayLabel = sourceNumber === null ? label : `Source ${sourceNumber + 1}`;
  const snippet = source?.chunk_text?.replace(/\s+/g, " ").trim();
  const title = isWeb ? (source?.web_title || "Web Source") : (source?.document_name || displayLabel);

  return (
    <span
      className="md-cite-wrapper"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        className={`md-cite-pill${isWeb ? " md-web-cite-pill" : ""}`}
        onClick={() => {
          if (isWeb && source?.web_url) {
            window.open(source.web_url, "_blank", "noopener,noreferrer");
          } else if (source) {
            onClick?.(source);
          }
        }}
        aria-label={source ? `View ${displayLabel}: ${title}` : displayLabel}
      >
        {isWeb && (
          <svg
            width={11}
            height={11}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginRight: 3, display: "inline-block", verticalAlign: "middle" }}
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
          </svg>
        )}
        {displayLabel}
      </button>
      {open && source && (
        <span className="md-cite-preview" role="tooltip">
          <span className="md-cite-preview-title">
            {isWeb ? "🌐 " : ""}{title}
            {source.page_number ? ` · p. ${source.page_number}` : ""}
          </span>
          {snippet && (
            <span className="md-cite-preview-text">
              {snippet.slice(0, 220)}{snippet.length > 220 ? "…" : ""}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function renderWithCitationPills(
  text: string,
  sources: SourceResponse[],
  onCitationClick?: (source: SourceResponse) => void,
): ReactNode[] {
  // Support embedded HTML line breaks like <br> / <br/> / <br /> cleanly
  const brSegments = text.split(/(<br\s*\/?>)/gi);
  return brSegments.flatMap((seg, segIdx) => {
    if (/^<br\s*\/?>$/i.test(seg)) {
      return [<br key={`br-${segIdx}`} className="md-br" />];
    }
    const parts = seg.split(CITE_SPLIT);
    return parts.map((part, i) => {
      if (CITE_TEST.test(part)) {
        const cleanLabel = part.replaceAll("[", "").replaceAll("]", "").replaceAll("【", "").replaceAll("】", "").trim();
        const sourceIndex = getSourceIndex(cleanLabel);
        return (
          <CitationPill
            key={`cite-${segIdx}-${i}`}
            label={cleanLabel}
            source={sourceIndex === null ? undefined : sources[sourceIndex]}
            onClick={onCitationClick}
          />
        );
      }
      return part;
    });
  });
}

function sanitizeListChildren(children: ReactNode): ReactNode {
  const cleanStr = (str: string) =>
    str.replace(/^[•⁃◦▪\s]+/, "").replace(/^(\d+[.)]|\([0-9a-zA-Z]+\))\s+/, "");

  if (typeof children === "string") {
    return cleanStr(children);
  }
  if (Array.isArray(children) && children.length > 0 && typeof children[0] === "string") {
    const cleaned = cleanStr(children[0]);
    return [cleaned, ...children.slice(1)];
  }
  return children;
}

function processChildrenWithCitations(
  children: ReactNode,
  sources: SourceResponse[],
  onCitationClick?: (source: SourceResponse) => void,
): ReactNode {
  if (Array.isArray(children)) {
    return children
      .flatMap((child, i) =>
        typeof child === "string"
          ? renderWithCitationPills(child, sources, onCitationClick).map((node, j) => ({ key: `${i}-${j}`, node }))
          : [{ key: String(i), node: child }]
      )
      .map(({ key, node }) => <span key={key}>{node}</span>);
  }
  if (typeof children === "string") {
    return renderWithCitationPills(children, sources, onCitationClick);
  }
  return children;
}

function createComponents(
  sources: SourceResponse[],
  onCitationClick?: (source: SourceResponse) => void,
): Components {
  return {
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
      return <p className="md-p">{processChildrenWithCitations(children, sources, onCitationClick)}</p>;
    },

  // Headings with clear visual hierarchy
  h1({ children }) { return <h1 className="md-h md-h1">{children}</h1>; },
  h2({ children }) { return <h2 className="md-h md-h2">{children}</h2>; },
  h3({ children }) { return <h3 className="md-h md-h3">{children}</h3>; },
  h4({ children }) { return <h4 className="md-h md-h4">{children}</h4>; },

  // Lists
  ul({ children }) { return <ul className="md-ul">{children}</ul>; },
  ol({ children }) { return <ol className="md-ol">{children}</ol>; },
  li({ children }) { return <li className="md-li">{processChildrenWithCitations(sanitizeListChildren(children), sources, onCitationClick)}</li>; },

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
  th({ children }) { return <th className="md-th">{processChildrenWithCitations(children, sources, onCitationClick)}</th>; },
  td({ children }) { return <td className="md-td">{processChildrenWithCitations(children, sources, onCitationClick)}</td>; },

    // Text nodes are handled in paragraph and list renderers above so each
    // citation can resolve against this message's source list.
  };
}

interface MarkdownContentProps {
  children: string;
  className?: string;
  sources?: SourceResponse[];
  onCitationClick?: (source: SourceResponse) => void;
  /** Show a blinking cursor at the end (while the model is still streaming) */
  isStreaming?: boolean;
}

/**
 * Renders an assistant message with proper markdown formatting:
 * headings, lists, code blocks with syntax highlighting, bold/em,
 * tables, blockquotes, and [Source N] citation pills.
 * When isStreaming=true a blinking cursor is appended to the last line.
 */
export function MarkdownContent({
  children,
  className,
  isStreaming,
  sources = [],
  onCitationClick,
}: MarkdownContentProps) {
  const components = createComponents(sources, onCitationClick);

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

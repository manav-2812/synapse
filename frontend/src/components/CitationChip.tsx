import { useState, useRef, useEffect } from "react";
import { Icon } from "./ui/Icon";
import type { SourceResponse } from "../types/api";

interface CitationChipProps {
  source: SourceResponse;
  onClick: () => void;
}

function getFileBadge(filename?: string | null): { ext: string; color: string } {
  if (!filename) return { ext: "DOC", color: "var(--accent)" };
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return { ext: "PDF", color: "#e5484d" };
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return { ext: "DOCX", color: "#2d7ff0" };
  if (lower.endsWith(".txt")) return { ext: "TXT", color: "#16a34a" };
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return { ext: "IMG", color: "#c5861b" };
  return { ext: "DOC", color: "var(--accent)" };
}

export function CitationChip({ source, onClick }: CitationChipProps) {
  const [showPopover, setShowPopover] = useState(false);
  const timerRef = useRef<number | null>(null);
  const badge = getFileBadge(source.document_name);

  // Normalize score to percentage if available (Chroma/retriever cosine/BM25 distance or score)
  const scorePercent =
    source.score !== null && source.score !== undefined
      ? Math.min(100, Math.max(1, Math.round(source.score <= 1 ? source.score * 100 : source.score)))
      : null;

  function handleMouseEnter() {
    timerRef.current = window.setTimeout(() => {
      setShowPopover(true);
    }, 180);
  }

  function handleMouseLeave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowPopover(false);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      className="citation-chip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className="source-chip"
        onClick={onClick}
        aria-label={`Source: ${source.document_name || "Document"}`}
      >
        <span
          className="sc-badge"
          style={{ backgroundColor: `color-mix(in srgb, ${badge.color} 15%, transparent)`, color: badge.color }}
        >
          {badge.ext}
        </span>
        <span className="sc-text">
          {source.document_name || "Unknown source"}
          {source.page_number ? ` · p.${source.page_number}` : ""}
        </span>
      </button>

      {showPopover && (
        <div className="citation-popover" role="tooltip">
          <div className="cp-header">
            <div className="cp-title-row">
              <span
                className="sc-badge"
                style={{ backgroundColor: `color-mix(in srgb, ${badge.color} 20%, transparent)`, color: badge.color }}
              >
                {badge.ext}
              </span>
              <span className="cp-doc-name">{source.document_name || "Document excerpt"}</span>
            </div>
            {source.page_number && (
              <span className="cp-page-badge">Page {source.page_number}</span>
            )}
          </div>

          {scorePercent !== null && (
            <div className="cp-score-row">
              <div className="cp-score-bar-bg">
                <div
                  className="cp-score-bar-fill"
                  style={{ width: `${scorePercent}%` }}
                />
              </div>
              <span className="cp-score-text">{scorePercent}% relevance</span>
            </div>
          )}

          <div className="cp-snippet">
            <p>&ldquo;{source.chunk_text.slice(0, 240)}{source.chunk_text.length > 240 ? "…" : ""}&rdquo;</p>
          </div>

          <div className="cp-footer">
            <Icon name="search" size={12} />
            <span>Click chip to view full excerpt</span>
          </div>
        </div>
      )}
    </div>
  );
}

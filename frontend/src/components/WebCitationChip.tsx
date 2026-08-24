import { useState, useRef, useEffect } from "react";
import { Icon } from "./ui/Icon";
import type { SourceResponse } from "../types/api";

interface WebCitationChipProps {
  source: SourceResponse;
  /** 1-based display index, e.g. "Source 1" */
  index: number;
}

/** Renders a citation pill for a web-sourced answer (Tavily result).
 *
 * Visual language matches CitationChip but uses a "WEB" badge instead of a
 * file-type badge, so it's immediately distinguishable from document sources.
 */
export function WebCitationChip({ source, index }: WebCitationChipProps) {
  const [showPopover, setShowPopover] = useState(false);
  const timerRef = useRef<number | null>(null);

  const title = source.web_title || source.document_name || `Source ${index}`;
  const url = source.web_url || "";
  const hostname = (() => {
    try {
      return url ? new URL(url).hostname.replace(/^www\./, "") : "";
    } catch {
      return url;
    }
  })();

  function handleMouseEnter() {
    timerRef.current = window.setTimeout(() => setShowPopover(true), 180);
  }
  function handleMouseLeave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowPopover(false);
  }
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div
      className="citation-chip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <a
        href={url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="source-chip web-source-chip"
        aria-label={`Web source: ${title}`}
        title={title ? `${title}${hostname ? ` (${hostname})` : ""}` : "Web Source"}
        onClick={(e) => !url && e.preventDefault()}
      >
        <Icon name="globe" size={15} className="web-source-globe-icon" />
        <span className="web-source-text">Web Source</span>
      </a>

      {showPopover && (
        <div className="citation-popover web-citation-popover" role="tooltip">
          <div className="cp-header">
            <div className="cp-title-row">
              <span className="sc-badge web-sc-badge">WEB</span>
              <span className="cp-doc-name">{title}</span>
            </div>
            {source.web_published_date && (
              <span className="cp-page-badge">{source.web_published_date}</span>
            )}
          </div>

          {hostname && (
            <div className="web-cp-url-row">
              <Icon name="externalLink" size={11} />
              <span className="web-cp-url">{hostname}</span>
            </div>
          )}

          <div className="cp-snippet">
            <p>
              &ldquo;
              {source.chunk_text.slice(0, 240)}
              {source.chunk_text.length > 240 ? "…" : ""}
              &rdquo;
            </p>
          </div>

          {url && (
            <div className="cp-footer web-cp-footer">
              <Icon name="externalLink" size={12} />
              <span>Click to open source in new tab</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

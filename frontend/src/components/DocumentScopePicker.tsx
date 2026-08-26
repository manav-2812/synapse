import { useEffect, useRef, useState, useMemo, type ChangeEvent } from "react";
import { documentsApi } from "../api/documents";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Icon } from "./ui/Icon";
import type { DocumentResponse } from "../types/api";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  /** When true, show an "upload a document" action inside the picker. */
  allowUpload?: boolean;
  /** Preferred direction the dropdown opens. Auto-reverses if colliding with screen boundaries. */
  popupDirection?: "up" | "down";
  /** Button size. "sm" = compact pill (chat bar). "md" = taller, matches form inputs (default). */
  size?: "sm" | "md";
  /** When true, renders without doc icon and without external chips, matching model dropdown pill */
  minimal?: boolean;
}

function getFileType(filename: string): "pdf" | "docx" | "md" | "txt" | "default" {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "docx";
  if (lower.endsWith(".md")) return "md";
  if (lower.endsWith(".txt")) return "txt";
  return "default";
}

export function DocumentScopePicker({
  value,
  onChange,
  allowUpload,
  popupDirection = "down",
  size = "md",
  minimal = false,
}: Props) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [actualDirection, setActualDirection] = useState<"up" | "down">(popupDirection);
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | undefined>(undefined);

  const fileRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    documentsApi
      .list()
      .then(setDocs)
      .catch(() => {
        /* non-fatal */
      });
  }, []);

  // Compute collision-aware direction & available viewport height when opening
  useEffect(() => {
    if (open && pickerRef.current) {
      const rect = pickerRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;

      if (popupDirection === "up") {
        if (spaceAbove < 280 && spaceBelow > spaceAbove) {
          setActualDirection("down");
          setMenuMaxHeight(Math.max(160, Math.min(380, spaceBelow - 16)));
        } else {
          setActualDirection("up");
          setMenuMaxHeight(Math.max(160, Math.min(380, spaceAbove - 16)));
        }
      } else {
        if (spaceBelow < 280 && spaceAbove > spaceBelow) {
          setActualDirection("up");
          setMenuMaxHeight(Math.max(160, Math.min(380, spaceAbove - 16)));
        } else {
          setActualDirection("down");
          setMenuMaxHeight(Math.max(160, Math.min(380, spaceBelow - 16)));
        }
      }

      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open, popupDirection]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent | TouchEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  }

  async function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const d = await documentsApi.upload(file);
      setDocs((prev) => [d, ...prev]);
      onChange([...value, d.id]);
      toast("success", "Uploaded", d.original_filename);
    } catch (err) {
      toast(
        "error",
        "Upload failed",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const completed = docs.filter(
    (d) => (d.processing_status === "completed" || (d as any).status === "completed") && d.file_type !== "image",
  );
  const selectedDocs = docs.filter((d) => value.includes(d.id));

  const filteredDocs = useMemo(() => {
    if (!search.trim()) return completed;
    const q = search.toLowerCase();
    return completed.filter((d) => d.original_filename.toLowerCase().includes(q));
  }, [completed, search]);

  const displayText =
    minimal
      ? value.length === 0
        ? "All Documents"
        : value.length === 1
          ? selectedDocs[0]?.original_filename || "1 Document"
          : `${value.length} Documents`
      : value.length === 0
        ? "All Documents"
        : "+ Add Document";

  return (
    <div ref={pickerRef} className="scope-picker">
      <button
        type="button"
        className={`scope-trigger scope-trigger--${size} ${minimal ? "scope-trigger--minimal" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={minimal && value.length === 1 ? selectedDocs[0]?.original_filename : undefined}
      >
        {!minimal && <Icon name="doc" size={12} />}
        <span className="scope-trigger-text">{displayText}</span>
        <Icon name="chevronDown" size={13} className={`scope-chev ${open ? "open" : ""}`} />
      </button>

      {open && (
        <div
          className={`scope-dropdown-menu ${actualDirection === "up" ? "scope-dropdown-menu--up" : "scope-dropdown-menu--down"} ${minimal ? "scope-dropdown-menu--minimal" : ""}`}
          style={menuMaxHeight ? { maxHeight: `${menuMaxHeight}px` } : undefined}
          role="listbox"
          aria-multiselectable="true"
        >
          {/* Quick Search Header if there are 3+ documents */}
          {completed.length >= 3 && (
            <div className="scope-dropdown-search">
              <Icon name="search" size={13} />
              <input
                ref={searchInputRef}
                type="text"
                className="scope-dropdown-search-input"
                placeholder={`Search ${completed.length} documents...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                autoComplete="off"
                spellCheck={false}
              />
              {search && (
                <button
                  type="button"
                  className="scope-search-clear"
                  onClick={() => setSearch("")}
                  title="Clear search"
                >
                  <Icon name="close" size={11} />
                </button>
              )}
            </div>
          )}

          {/* Active selection banner if specific documents are selected */}
          {value.length > 0 && !search.trim() && (
            <div className="scope-selection-bar">
              <span>{value.length} selected</span>
              <button
                type="button"
                className="scope-reset-btn"
                onClick={() => onChange([])}
              >
                Reset to All
              </button>
            </div>
          )}

          <div className="scope-dropdown-list">
            {/* All Documents Option (only show if no active search) */}
            {!search.trim() && (
              <button
                type="button"
                className={`cm-item ${value.length === 0 ? "active" : ""}`}
                onClick={() => {
                  onChange([]);
                  setOpen(false);
                }}
              >
                <div className="cm-item-left">
                  <div className="cm-item-icon all">
                    <Icon name="layers" size={13} />
                  </div>
                  <div className="cm-item-text">
                    <span className="cm-item-title">All Documents</span>
                    <span className="cm-item-desc">Entire library ({completed.length} items)</span>
                  </div>
                </div>
                {value.length === 0 && (
                  <div className="cm-check-badge">
                    <Icon name="check" size={11} />
                  </div>
                )}
              </button>
            )}

            {/* Filtered Document List */}
            {filteredDocs.length > 0 ? (
              filteredDocs.map((d) => {
                const checked = value.includes(d.id);
                const fileType = getFileType(d.original_filename);

                return (
                  <button
                    key={d.id}
                    type="button"
                    className={`cm-item ${checked ? "active" : ""}`}
                    onClick={() => toggle(d.id)}
                    title={d.original_filename}
                  >
                    <div className="cm-item-left">
                      <div className={`cm-item-icon ${fileType}`}>
                        <Icon name="doc" size={13} />
                      </div>
                      <div className="cm-item-text">
                        <span className="cm-item-title">{d.original_filename}</span>
                        <span className="cm-item-desc">
                          {d.chunk_count ? `${d.chunk_count} passages` : "Ready for search"}
                        </span>
                      </div>
                    </div>
                    <div className={`cm-checkbox ${checked ? "checked" : ""}`}>
                      {checked && <Icon name="check" size={10} />}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="scope-empty-match">
                <span>No documents match &ldquo;{search}&rdquo;</span>
              </div>
            )}
          </div>

          {allowUpload && (
            <>
              <div className="cm-divider" />
              <button
                type="button"
                className="cm-item cm-item--upload"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <div className="cm-item-left">
                  <div className="cm-item-icon upload">
                    <Icon name="upload" size={13} />
                  </div>
                  <div className="cm-item-text">
                    <span className="cm-item-title">
                      {busy ? "Uploading document…" : "Upload a new document"}
                    </span>
                  </div>
                </div>
              </button>
            </>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            style={{ display: "none" }}
            onChange={onUpload}
          />
        </div>
      )}

      {!minimal && value.length > 0 && (
        <div className="scope-chips">
          {selectedDocs.map((d) => (
            <span key={d.id} className="scope-chip" title={d.original_filename}>
              <Icon name="doc" size={12} />
              <span className="scope-chip-title">{d.original_filename}</span>
              <button
                type="button"
                className="scope-x"
                aria-label={`Remove ${d.original_filename}`}
                onClick={() => toggle(d.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

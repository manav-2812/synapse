import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
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
  /** Which direction the dropdown opens. Default "down". Use "up" when the picker is at the bottom of the screen (e.g. chat composer). */
  popupDirection?: "up" | "down";
  /** Button size. "sm" = compact pill (chat bar). "md" = taller, matches form inputs (default). */
  size?: "sm" | "md";
  /** When true, renders without doc icon and without external chips, matching model dropdown pill */
  minimal?: boolean;
}

interface PanelPos {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
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
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    documentsApi
      .list()
      .then(setDocs)
      .catch(() => {
        /* non-fatal */
      });
  }, []);

  // Recalculate panel position whenever it opens
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    if (popupDirection === "up") {
      setPanelPos({
        bottom: window.innerHeight - rect.top + 6,
        left: rect.left,
        width: rect.width,
      });
    } else {
      setPanelPos({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [open, popupDirection]);

  // Close on click / tap outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      )
        return;
      setOpen(false);
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
    (d) => d.processing_status === "completed" && d.file_type !== "image",
  );
  const selectedDocs = docs.filter((d) => value.includes(d.id));

  const displayText =
    value.length === 0
      ? "All Documents"
      : value.length === 1
        ? selectedDocs[0]?.original_filename || "1 Document"
        : `${value.length} Documents`;

  const panel = open && panelPos
    ? createPortal(
        <div
          ref={panelRef}
          className="scope-dropdown-menu"
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "fixed",
            top: panelPos.top !== undefined ? `${panelPos.top}px` : "auto",
            bottom: panelPos.bottom !== undefined ? `${panelPos.bottom}px` : "auto",
            left: `${panelPos.left}px`,
            right: "auto",
            minWidth: Math.max(panelPos.width, 240),
            maxWidth: 320,
            zIndex: 99999,
          }}
        >
          {/* All Documents option */}
          <button
            type="button"
            className={`cm-item ${value.length === 0 ? "active" : ""}`}
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
          >
            <div className="cm-item-text">
              <span className="cm-item-title">All Documents</span>
              <span className="cm-item-desc">Entire library ({completed.length} items)</span>
            </div>
            {value.length === 0 && <Icon name="check" size={12} />}
          </button>

          {/* Document list */}
          {completed.map((d) => {
            const checked = value.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                className={`cm-item ${checked ? "active" : ""}`}
                onClick={() => toggle(d.id)}
              >
                <div className="cm-item-text">
                  <span className="cm-item-title">{d.original_filename}</span>
                  <span className="cm-item-desc">
                    {d.chunk_count ? `${d.chunk_count} passages` : "Ready for search"}
                  </span>
                </div>
                {checked && <Icon name="check" size={12} />}
              </button>
            );
          })}

          {allowUpload && (
            <>
              <div className="cm-divider" />
              <button
                type="button"
                className="cm-item"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <div className="cm-item-text">
                  <span className="cm-item-title">
                    {busy ? "Uploading document…" : "+ Upload a new document"}
                  </span>
                </div>
                <Icon name="upload" size={12} />
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
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="scope-picker">
      <button
        ref={triggerRef}
        type="button"
        className={`scope-trigger scope-trigger--${size} ${minimal ? "scope-trigger--minimal" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={value.length === 1 ? selectedDocs[0]?.original_filename : undefined}
      >
        {!minimal && <Icon name="doc" size={12} />}
        <span className="scope-trigger-text">
          {displayText}
        </span>
        <Icon name="chevronDown" size={13} className={`scope-chev ${open ? "open" : ""}`} />
      </button>

      {panel}

      {!minimal && value.length > 0 && (
        <div className="scope-chips">
          {selectedDocs.map((d) => (
            <span key={d.id} className="scope-chip">
              {d.original_filename}
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

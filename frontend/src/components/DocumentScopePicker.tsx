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

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      )
        return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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

  const panel = open && panelPos
    ? createPortal(
        <div
          ref={panelRef}
          className={`scope-panel${popupDirection === "up" ? " scope-panel--up" : ""}`}
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "fixed",
            top: panelPos.top,
            bottom: panelPos.bottom,
            left: panelPos.left,
            minWidth: Math.max(panelPos.width, 220),
          }}
        >
          <div className="scope-panel-header">
            <span className="scope-panel-title">Select documents</span>
            <button
              type="button"
              className="scope-close-btn"
              aria-label="Close document picker"
              onClick={() => setOpen(false)}
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          <div className="scope-list">
            {completed.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, padding: "6px 10px" }}>
                No processed documents yet.
              </div>
            ) : (
              completed.map((d) => (
                <label
                  key={d.id}
                  className="scope-opt"
                  role="option"
                  aria-selected={value.includes(d.id)}
                >
                  <input
                    type="checkbox"
                    checked={value.includes(d.id)}
                    onChange={() => toggle(d.id)}
                  />
                  <span className="scope-opt-name" title={d.original_filename}>
                    {d.original_filename}
                  </span>
                </label>
              ))
            )}
          </div>

          {allowUpload && (
            <div className="scope-panel-footer">
              <button
                type="button"
                className="scope-upload"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <Icon name="upload" size={14} />
                {busy ? "Uploading…" : "Upload a document"}
              </button>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
            hidden
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
        className={`scope-trigger scope-trigger--${size}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Icon name="doc" size={12} />
        <span>
          {value.length === 0
            ? "All documents"
            : `${value.length} document${value.length > 1 ? "s" : ""} selected`}
        </span>
        <Icon name="chevron" size={12} className={`scope-chev ${open ? "open" : ""}`} />
      </button>

      {panel}

      {value.length > 0 && (
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

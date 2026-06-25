import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
}

export function DocumentScopePicker({ value, onChange, allowUpload }: Props) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    documentsApi
      .list()
      .then(setDocs)
      .catch(() => {
        /* non-fatal: picker just stays empty */
      });
  }, []);

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

  const completed = docs.filter((d) => d.processing_status === "completed");
  const selectedDocs = docs.filter((d) => value.includes(d.id));

  return (
    <div className="scope-picker">
      <button
        type="button"
        className="scope-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Icon name="doc" size={14} />
        <span>
          {value.length === 0
            ? "All documents"
            : `${value.length} document${value.length > 1 ? "s" : ""} selected`}
        </span>
        <Icon name="chevron" size={14} className={`scope-chev ${open ? "open" : ""}`} />
      </button>

      {open && (
        <div className="scope-panel">
          {completed.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, padding: 6 }}>
              No processed documents yet.
            </div>
          ) : (
            completed.map((d) => (
              <label key={d.id} className="scope-opt">
                <input
                  type="checkbox"
                  checked={value.includes(d.id)}
                  onChange={() => toggle(d.id)}
                />
                <span className="scope-opt-name">{d.original_filename}</span>
              </label>
            ))
          )}
          {allowUpload && (
            <button
              type="button"
              className="scope-upload"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Icon name="upload" size={14} />
              {busy ? "Uploading…" : "Upload a document"}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
            hidden
            onChange={onUpload}
          />
        </div>
      )}

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

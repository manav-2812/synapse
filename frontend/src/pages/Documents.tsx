import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { documentsApi, uploadWithProgress, type UploadHandle } from "../api/documents";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { useDocumentPolling } from "../hooks/useDocumentPolling";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Icon } from "../components/ui/Icon";
import { Modal } from "../components/ui/Modal";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Skeleton } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { Tip } from "../components/Tip";
import { TIP } from "../components/tips";
import { formatDate } from "../lib/format";
import type {
  DocumentResponse,
  DocumentStatusResponse,
  FolderResponse,
} from "../types/api";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface ActiveUpload {
  id: string;
  name: string;
  progress: number;
  abort: () => void;
}

export default function Documents() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [folders, setFolders] = useState<FolderResponse[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<ActiveUpload[]>([]);
  const [drag, setDrag] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [deleteDoc, setDeleteDoc] = useState<DocumentResponse | null>(null);
  const [renameDoc, setRenameDoc] = useState<DocumentResponse | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [d, f] = await Promise.all([documentsApi.list(), documentsApi.listFolders()]);
      setDocs(d);
      setFolders(f);
    } catch (err) {
      toast(
        "error",
        "Couldn't load documents",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onStatus = useCallback((id: string, status: DocumentStatusResponse) => {
    setDocs((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              processing_status: status.processing_status,
              page_count: status.page_count,
              error_message: status.error_message,
            }
          : d,
      ),
    );
  }, []);
  useDocumentPolling(docs, onStatus);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const id = `${Date.now()}-${file.name}`;
      const handle: UploadHandle = uploadWithProgress(file, activeFolder, {
        onProgress: (pct) =>
          setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, progress: pct } : u))),
      });
      setUploads((prev) => [...prev, { id, name: file.name, progress: 0, abort: handle.abort }]);

      handle.promise
        .then(async () => {
          setUploads((prev) => prev.filter((u) => u.id !== id));
          await load();
          toast("success", "Uploaded", file.name);
        })
        .catch((err: unknown) => {
          setUploads((prev) => prev.filter((u) => u.id !== id));
          if ((err as Error)?.name === "AbortError") {
            toast("info", "Cancelled", `Upload of ${file.name} cancelled.`);
          } else {
            toast(
              "error",
              "Upload failed",
              err instanceof ApiError ? err.message : "Please try again.",
            );
          }
        });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function cancelUpload(id: string) {
    setUploads((prev) => {
      const u = prev.find((x) => x.id === id);
      u?.abort();
      return prev;
    });
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    void handleFiles(e.target.files);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    void handleFiles(e.dataTransfer.files);
  }

  async function confirmDelete() {
    if (!deleteDoc) return;
    try {
      await documentsApi.remove(deleteDoc.id);
      setDocs((prev) => prev.filter((d) => d.id !== deleteDoc.id));
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(deleteDoc.id);
        return n;
      });
      toast("success", "Deleted", deleteDoc.original_filename);
    } catch (err) {
      toast(
        "error",
        "Delete failed",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setDeleteDoc(null);
    }
  }

  async function createFolder() {
    const name = newFolder.trim();
    if (!name) return;
    try {
      const f = await documentsApi.createFolder(name);
      setFolders((prev) => [...prev, f]);
      setNewFolder("");
      setCreateOpen(false);
      toast("success", "Folder created", name);
    } catch (err) {
      toast(
        "error",
        "Couldn't create folder",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function deleteFolder(f: FolderResponse) {
    try {
      await documentsApi.removeFolder(f.id);
      setFolders((prev) => prev.filter((x) => x.id !== f.id));
      if (activeFolder === f.id) setActiveFolder(null);
      toast("success", "Folder deleted", f.name);
    } catch (err) {
      toast(
        "error",
        "Couldn't delete folder",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function openRename(d: DocumentResponse) {
    setRenameDoc(d);
    setRenameValue(d.original_filename);
  }

  async function commitRename() {
    if (!renameDoc) return;
    const name = renameValue.trim();
    if (!name || name === renameDoc.original_filename) {
      setRenameDoc(null);
      return;
    }
    const id = renameDoc.id;
    const prevName = renameDoc.original_filename;
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, original_filename: name } : d)));
    setRenameDoc(null);
    try {
      await documentsApi.rename(id, name);
    } catch (err) {
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, original_filename: prevName } : d)));
      toast(
        "error",
        "Rename failed",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  function study(scope: string[], to: string) {
    if (scope.length === 0) {
      toast("info", "Select documents", "Pick one or more documents to study from.");
      return;
    }
    navigate(`${to}?scope=${scope.join(",")}`);
  }

  const visible = activeFolder
    ? docs.filter((d) => d.folder_id === activeFolder)
    : docs;
  const scopeIds = [...selected];

  return (
    <div className="stack">
      <Tip
        id={TIP.documentsUpload}
        title="Drag & drop to upload"
        icon="upload"
      >
        Drop PDFs or notes anywhere here, or use the upload button — Synapse
        parses them for chat, quizzes, and summaries.
      </Tip>
      <div className="page-head spread">
        <div>
          <h1>Documents</h1>
          <p className="page-sub muted">
            Upload study material, then chat, quiz, and summarize it.
          </p>
        </div>
        <div className="page-actions">
          <Button
            variant="secondary"
            onClick={() => setCreateOpen(true)}
          >
            <Icon name="plus" size={16} /> New folder
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> Upload
          </Button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        aria-label="Upload documents"
        accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
        // Visually hidden (not `display:none`) so it stays in the DOM and is
        // still settable by automated file-upload (e.g. Playwright setInputFiles).
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
        onChange={onPick}
      />

      <div
        className={`upload-zone ${drag ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <span className="qc-icon" style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
          <Icon name="upload" size={20} />
        </span>
        <div>
          <strong>Drop files here</strong> or click to browse
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          PDF, DOCX, TXT, PNG, JPG
        </div>
      </div>

      {uploads.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="section-title">Uploading</div>
          <div className="stack">
            {uploads.map((u) => (
              <div key={u.id} className="upload-row">
                <div className="li-main" style={{ flex: 1, minWidth: 0 }}>
                  <div className="doc-name">{u.name}</div>
                  <div className="progress" aria-hidden="true">
                    <span style={{ width: `${u.progress}%` }} />
                  </div>
                  <div className="doc-sub">{u.progress}%</div>
                </div>
                <button
                  className="icon-btn"
                  aria-label={`Cancel upload of ${u.name}`}
                  onClick={() => cancelUpload(u.id)}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {folders.length > 0 && (
        <div className="folder-bar">
          <button
            className={`folder-chip ${activeFolder === null ? "active" : ""}`}
            onClick={() => setActiveFolder(null)}
          >
            All
          </button>
          {folders.map((f) => (
            <span key={f.id} className="folder-chip-wrap" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <button
                className={`folder-chip ${activeFolder === f.id ? "active" : ""}`}
                onClick={() => setActiveFolder(f.id)}
              >
                {f.name}
              </button>
              <button
                className="icon-btn"
                style={{ width: 24, height: 24, fontSize: 14 }}
                aria-label={`Delete folder ${f.name}`}
                onClick={() => void deleteFolder(f)}
              >
                <Icon name="trash" size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      {scopeIds.length > 0 && (
        <div className="toolbar" style={{ background: "var(--accent-bg)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--accent-border)" }}>
          <span className="muted">
            {scopeIds.length} selected for study
          </span>
          <Button variant="secondary" className="btn-sm" onClick={() => study(scopeIds, "/notes")}>
            <Icon name="doc" size={15} /> Notes
          </Button>
          <Button variant="secondary" className="btn-sm" onClick={() => study(scopeIds, "/quiz")}>
            <Icon name="quiz" size={15} /> Quiz
          </Button>
          <Button variant="secondary" className="btn-sm" onClick={() => study(scopeIds, "/flashcards")}>
            <Icon name="card" size={15} /> Flashcards
          </Button>
        </div>
      )}

      {loading ? (
        <div className="list">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="list-item doc-row">
              <div className="li-main" style={{ gap: 8 }}>
                <Skeleton width="42%" height="14px" />
                <Skeleton width="68%" height="12px" />
                <Skeleton width="30%" height="12px" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="doc"
          title={activeFolder ? "No documents in this folder." : "No documents yet."}
          hint="Upload a file above to get started."
        />
      ) : (
        <div className="list">
          {visible.map((d) => (
            <div key={d.id} className={`list-item doc-row status-${d.processing_status}`}>
              <label className="li-main" style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selected.has(d.id)}
                  onChange={() => toggleSelect(d.id)}
                  style={{ marginTop: 3 }}
                  aria-label={`Select ${d.original_filename} for study`}
                />
                <div className="doc-meta">
                  <div className="doc-name">{d.original_filename}</div>
                  <div className="doc-sub">
                    {formatBytes(d.file_size_bytes)} · {formatDate(d.created_at)}
                    {d.page_count != null && ` · ${d.page_count} pages`}
                  </div>
                  <div className="doc-sub">
                    <StatusBadge status={d.processing_status} error={d.error_message} />
                  </div>
                </div>
              </label>
              <div className="li-actions">
                <button
                  className="icon-btn"
                  aria-label={`Rename ${d.original_filename}`}
                  onClick={() => openRename(d)}
                >
                  <Icon name="edit" size={16} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Delete ${d.original_filename}`}
                  onClick={() => setDeleteDoc(d)}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New folder">
        <Input
          label="Folder name"
          value={newFolder}
          onChange={(e) => setNewFolder(e.target.value)}
          placeholder="e.g. Biology 101"
          onKeyDown={(e) => {
            if (e.key === "Enter") void createFolder();
          }}
        />
        <Button onClick={() => void createFolder()} disabled={!newFolder.trim()}>
          Create folder
        </Button>
      </Modal>

      <Modal open={!!deleteDoc} onClose={() => setDeleteDoc(null)} title="Delete document">
        <p>
          Delete <strong>{deleteDoc?.original_filename}</strong>? This removes the file,
          its extracted text, and any related chat history.
        </p>
        <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => setDeleteDoc(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void confirmDelete()}>
            Delete
          </Button>
        </div>
      </Modal>

      <Modal open={!!renameDoc} onClose={() => setRenameDoc(null)} title="Rename document">
        <Input
          label="File name"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitRename();
          }}
        />
        <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => setRenameDoc(null)}>
            Cancel
          </Button>
          <Button onClick={() => void commitRename()}>Rename</Button>
        </div>
      </Modal>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
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
import { formatDate, formatRelative } from "../lib/format";
import type {
  DocumentResponse,
  DocumentStatusResponse,
  FolderResponse,
} from "../types/api";

function formatBytes(n: number): string {
  if (!n || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type FileCategory = "all" | "pdf" | "docx" | "txt" | "image";
type StatusFilter = "all" | "completed" | "processing" | "failed";
type SortOption = "date_desc" | "date_asc" | "name_asc" | "name_desc" | "size_desc" | "size_asc";
type ViewMode = "grid" | "list";

interface ActiveUpload {
  id: string;
  name: string;
  progress: number;
  abort: () => void;
}

function getFileCategory(filename: string, fileType?: string): FileCategory {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf" || fileType === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc" || fileType === "docx") return "docx";
  if (ext === "txt" || ext === "md" || fileType === "txt") return "txt";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext) || fileType === "image") return "image";
  return "all";
}

function getFileBadgeColor(category: FileCategory): { label: string } {
  switch (category) {
    case "pdf":
      return { label: "PDF" };
    case "docx":
      return { label: "DOCX" };
    case "txt":
      return { label: "TXT" };
    case "image":
      return { label: "IMG" };
    default:
      return { label: "DOC" };
  }
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

  // Filters & View state
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<FileCategory>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("date_desc");
  const [docsCollapsed, setDocsCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem("synapse_doc_view") as ViewMode) || "grid";
    } catch {
      return "grid";
    }
  });

  // Modals state
  const [createOpen, setCreateOpen] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [deleteDoc, setDeleteDoc] = useState<DocumentResponse | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [renameDoc, setRenameDoc] = useState<DocumentResponse | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [inspectDoc, setInspectDoc] = useState<DocumentResponse | null>(null);
  const [moveDoc, setMoveDoc] = useState<DocumentResponse | null>(null);
  const [moveSelectedOpen, setMoveSelectedOpen] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const setView = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("synapse_doc_view", mode);
    } catch {
      /* ignore */
    }
  };

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

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      if (inspectDoc?.id === deleteDoc.id) setInspectDoc(null);
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

  async function confirmBulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => documentsApi.remove(id)));
      setDocs((prev) => prev.filter((d) => !selected.has(d.id)));
      setSelected(new Set());
      setBulkDeleteOpen(false);
      toast("success", "Deleted", `${ids.length} documents removed.`);
    } catch (err) {
      toast(
        "error",
        "Bulk delete failed",
        err instanceof ApiError ? err.message : "Please try again.",
      );
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
    if (!window.confirm(`Delete folder "${f.name}"? Documents in this folder will be unassigned.`)) return;
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

  function toggleSelectAll(filteredList: DocumentResponse[]) {
    if (selected.size === filteredList.length && filteredList.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredList.map((d) => d.id)));
    }
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
    if (inspectDoc?.id === id) setInspectDoc((prev) => prev ? { ...prev, original_filename: name } : null);
    setRenameDoc(null);
    try {
      await documentsApi.rename(id, name);
      toast("success", "Renamed", name);
    } catch (err) {
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, original_filename: prevName } : d)));
      toast(
        "error",
        "Rename failed",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function commitMove(docId: string, folderId: string | null) {
    try {
      await documentsApi.moveToFolder(docId, folderId);
      setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, folder_id: folderId } : d)));
      if (inspectDoc?.id === docId) setInspectDoc((prev) => prev ? { ...prev, folder_id: folderId } : null);
      setMoveDoc(null);
      const fName = folderId ? folders.find((f) => f.id === folderId)?.name || "folder" : "Root";
      toast("success", "Moved document", `Moved to ${fName}`);
    } catch (err) {
      toast("error", "Move failed", err instanceof ApiError ? err.message : "Please try again.");
    }
  }

  async function commitBulkMove(folderId: string | null) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => documentsApi.moveToFolder(id, folderId)));
      setDocs((prev) => prev.map((d) => (selected.has(d.id) ? { ...d, folder_id: folderId } : d)));
      setMoveSelectedOpen(false);
      setSelected(new Set());
      const fName = folderId ? folders.find((f) => f.id === folderId)?.name || "folder" : "Root";
      toast("success", "Moved documents", `${ids.length} documents moved to ${fName}`);
    } catch (err) {
      toast("error", "Bulk move failed", err instanceof ApiError ? err.message : "Please try again.");
    }
  }

  function study(scope: string[], to: string) {
    if (scope.length === 0) {
      toast("info", "Select documents", "Pick one or more documents to study from.");
      return;
    }
    navigate(`${to}?scope=${scope.join(",")}`);
  }

  // Analytics summary counts
  const totalStorage = useMemo(() => docs.reduce((acc, d) => acc + (d.file_size_bytes || 0), 0), [docs]);
  const readyDocsCount = useMemo(() => docs.filter((d) => d.processing_status === "completed").length, [docs]);
  const processingCount = useMemo(() => docs.filter((d) => d.processing_status === "processing" || d.processing_status === "pending").length, [docs]);

  // Filtering & Sorting
  const filteredDocs = useMemo(() => {
    let result = activeFolder !== null
      ? docs.filter((d) => d.folder_id === activeFolder)
      : docs;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((d) => d.original_filename.toLowerCase().includes(q));
    }

    if (categoryFilter !== "all") {
      result = result.filter((d) => getFileCategory(d.original_filename, d.file_type) === categoryFilter);
    }

    if (statusFilter !== "all") {
      result = result.filter((d) => d.processing_status === statusFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "date_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name_asc":
          return a.original_filename.localeCompare(b.original_filename);
        case "name_desc":
          return b.original_filename.localeCompare(a.original_filename);
        case "size_desc":
          return b.file_size_bytes - a.file_size_bytes;
        case "size_asc":
          return a.file_size_bytes - b.file_size_bytes;
        default:
          return 0;
      }
    });

    return result;
  }, [docs, activeFolder, search, categoryFilter, statusFilter, sortBy]);

  const scopeIds = useMemo(() => Array.from(selected), [selected]);

  return (
    <div className="doc-page-layout">
      {/* ── Page Header ── */}
      <div className="doc-head">
        <div className="doc-head-text">
          <h1 className="doc-head-title">Documents & Knowledge Base</h1>
          <p className="doc-head-sub muted">
            Upload PDFs, DOCX, notes, and textbook material. Synapse indexes and grounds every chat, quiz, and Cornell summary.
          </p>
        </div>
        <div className="doc-head-actions">
          <Button
            variant="secondary"
            onClick={() => setCreateOpen(true)}
            style={{ borderRadius: 999, height: 38, padding: "0 16px" }}
          >
            <Icon name="folderPlus" size={15} /> New Folder
          </Button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-generate-notes-pill"
          >
            <Icon name="upload" size={16} />
            <span>Upload Files</span>
          </button>
        </div>
      </div>

      {/* ── Live Analytics Stats Strip ── */}
      <div className="note-stats-strip">
        <div className="note-stat-item">
          <div className="note-stat-icon-wrap">
            <Icon name="doc" size={17} />
          </div>
          <div className="note-stat-content">
            <span className="note-stat-val">{docs.length}</span>
            <span className="note-stat-lbl">Total Documents</span>
          </div>
        </div>

        <div className="note-stat-item">
          <div className="note-stat-icon-wrap">
            <Icon name="checkCircle" size={17} />
          </div>
          <div className="note-stat-content">
            <span className="note-stat-val">{readyDocsCount} Ready</span>
            <span className="note-stat-lbl">{processingCount > 0 ? `${processingCount} processing…` : "All indexed in AI"}</span>
          </div>
        </div>

        <div className="note-stat-item">
          <div className="note-stat-icon-wrap">
            <Icon name="hardDrive" size={17} />
          </div>
          <div className="note-stat-content">
            <span className="note-stat-val">{formatBytes(totalStorage)}</span>
            <span className="note-stat-lbl">Storage Used</span>
          </div>
        </div>

        <div className="note-stat-item">
          <div className="note-stat-icon-wrap">
            <Icon name="folder" size={17} />
          </div>
          <div className="note-stat-content">
            <span className="note-stat-val">{folders.length}</span>
            <span className="note-stat-lbl">Collections</span>
          </div>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileRef}
        type="file"
        multiple
        aria-label="Upload documents"
        accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
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

      {/* ── High-End Executive Document Ingestion Studio ── */}
      <div
        className={`doc-dropzone-studio ${drag ? "is-dragover" : ""}`}
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
        <div className="doc-studio-main">
          <div className="doc-studio-icon-wrap">
            <Icon name="upload" size={24} />
          </div>
          <div className="doc-studio-info">
            <h3 className="doc-studio-title">
              Drag & drop study documents here
            </h3>
            <p className="doc-studio-sub">
              Upload course PDFs, lecture transcripts, and notes. Synapse indexes and grounds every chat, quiz, and summary.
            </p>
            <div className="doc-studio-actions">
              <button
                type="button"
                className="doc-studio-browse-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  fileRef.current?.click();
                }}
              >
                <Icon name="upload" size={14} />
                <span>Browse Local Files</span>
              </button>
              <span className="doc-studio-limit">Up to 50 MB per document</span>
            </div>
          </div>
        </div>

        <div className="doc-studio-formats-grid">
          <div className="doc-format-card">
            <div className="doc-format-card-icon" style={{ color: "#ef4444" }}>
              <Icon name="doc" size={16} />
            </div>
            <div className="doc-format-card-text">
              <span className="doc-format-card-name">PDF Documents</span>
              <span className="doc-format-card-desc">Textbooks, slides, papers</span>
            </div>
          </div>

          <div className="doc-format-card">
            <div className="doc-format-card-icon" style={{ color: "#2563eb" }}>
              <Icon name="fileText" size={16} />
            </div>
            <div className="doc-format-card-text">
              <span className="doc-format-card-name">Word & DOCX</span>
              <span className="doc-format-card-desc">Essays, sheets, outlines</span>
            </div>
          </div>

          <div className="doc-format-card">
            <div className="doc-format-card-icon" style={{ color: "#10b981" }}>
              <Icon name="stickyNote" size={16} />
            </div>
            <div className="doc-format-card-text">
              <span className="doc-format-card-name">Plain Text / MD</span>
              <span className="doc-format-card-desc">Markdown, transcripts, code</span>
            </div>
          </div>

          <div className="doc-format-card">
            <div className="doc-format-card-icon" style={{ color: "#8b5cf6" }}>
              <Icon name="image" size={16} />
            </div>
            <div className="doc-format-card-text">
              <span className="doc-format-card-name">Scans & Images</span>
              <span className="doc-format-card-desc">Diagrams, charts, photos</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Active Uploads Live Manager ── */}
      {uploads.length > 0 && (
        <div className="card doc-uploads-card">
          <div className="spread" style={{ marginBottom: 12 }}>
            <span className="section-title" style={{ margin: 0 }}>
              Uploading ({uploads.length})
            </span>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {uploads.map((u) => (
              <div key={u.id} className="doc-upload-item">
                <div className="doc-upload-item-icon">
                  <Icon name="doc" size={16} />
                </div>
                <div className="doc-upload-item-info">
                  <div className="spread">
                    <span className="doc-upload-name">{u.name}</span>
                    <span className="doc-upload-pct">{u.progress}%</span>
                  </div>
                  <div className="progress" style={{ margin: "4px 0 0" }}>
                    <span style={{ width: `${u.progress}%` }} />
                  </div>
                </div>
                <button
                  className="icon-btn"
                  aria-label={`Cancel upload of ${u.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelUpload(u.id);
                  }}
                  title="Cancel upload"
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Folders Navigation Bar ── */}
      <div className="doc-folders-hub">
        <div className="doc-folders-list">
          <button
            className={`doc-folder-pill ${activeFolder === null ? "active" : ""}`}
            onClick={() => setActiveFolder(null)}
          >
            <Icon name="layers" size={14} />
            <span>All Documents</span>
            <span className="doc-folder-count">{docs.length}</span>
          </button>

          {folders.map((f) => {
            const count = docs.filter((d) => d.folder_id === f.id).length;
            const isActive = activeFolder === f.id;
            return (
              <div key={f.id} className={`doc-folder-chip-wrap ${isActive ? "active" : ""}`}>
                <button
                  className="doc-folder-chip-btn"
                  onClick={() => setActiveFolder(f.id)}
                >
                  <Icon name="folder" size={14} />
                  <span>{f.name}</span>
                  <span className="doc-folder-count">{count}</span>
                </button>
                <button
                  className="doc-folder-del-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteFolder(f);
                  }}
                  title={`Delete folder ${f.name}`}
                  aria-label={`Delete folder ${f.name}`}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            );
          })}
        </div>

        <button
          className="doc-new-folder-chip"
          onClick={() => setCreateOpen(true)}
          title="Create collection folder"
        >
          <Icon name="plus" size={14} />
          <span>New Collection</span>
        </button>
      </div>

      {/* ── Control Toolbar: Search, Filters, Sorters & View Mode ── */}
      <div className="doc-control-bar">
        {/* Live Search Pill */}
        <div className="note-search-pill-wrap" style={{ flex: "1 1 240px", minWidth: 200 }}>
          <Icon name="search" size={13} className="note-search-pill-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="note-search-pill-input"
            placeholder="Search documents by name… (Press /)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search ? (
            <button
              className="note-search-pill-clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              title="Clear search"
            >
              <Icon name="close" size={11} />
            </button>
          ) : (
            <span className="doc-search-kbd">/</span>
          )}
        </div>

        {/* File Type Filter Tabs */}
        <div className="quiz-filter-tabs note-filter-pill-group">
          <button
            type="button"
            className={`quiz-tab-btn ${categoryFilter === "all" ? "active" : ""}`}
            onClick={() => setCategoryFilter("all")}
          >
            <Icon name="layoutGrid" size={12} />
            <span>All ({docs.length})</span>
          </button>
          <button
            type="button"
            className={`quiz-tab-btn ${categoryFilter === "pdf" ? "active" : ""}`}
            onClick={() => setCategoryFilter("pdf")}
          >
            <Icon name="doc" size={12} />
            <span>PDF</span>
          </button>
          <button
            type="button"
            className={`quiz-tab-btn ${categoryFilter === "docx" ? "active" : ""}`}
            onClick={() => setCategoryFilter("docx")}
          >
            <Icon name="fileText" size={12} />
            <span>DOCX</span>
          </button>
          <button
            type="button"
            className={`quiz-tab-btn ${categoryFilter === "txt" ? "active" : ""}`}
            onClick={() => setCategoryFilter("txt")}
          >
            <Icon name="stickyNote" size={12} />
            <span>TXT</span>
          </button>
          <button
            type="button"
            className={`quiz-tab-btn ${categoryFilter === "image" ? "active" : ""}`}
            onClick={() => setCategoryFilter("image")}
          >
            <Icon name="image" size={12} />
            <span>Images</span>
          </button>
        </div>

        {/* Status Filter */}
        <div className="doc-select-wrap">
          <select
            className="doc-select-control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by processing status"
          >
            <option value="all">Status: All</option>
            <option value="completed">Status: Ready</option>
            <option value="processing">Status: Processing</option>
            <option value="failed">Status: Failed</option>
          </select>
        </div>

        {/* Sort */}
        <div className="doc-select-wrap">
          <select
            className="doc-select-control"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort documents"
          >
            <option value="date_desc">Newest Added</option>
            <option value="date_asc">Oldest Added</option>
            <option value="name_asc">Name (A → Z)</option>
            <option value="name_desc">Name (Z → A)</option>
            <option value="size_desc">Largest Size</option>
            <option value="size_asc">Smallest Size</option>
          </select>
        </div>

        {/* View Toggle */}
        <div className="doc-view-toggle">
          <button
            type="button"
            className={`doc-view-btn ${viewMode === "grid" ? "active" : ""}`}
            onClick={() => setView("grid")}
            title="Grid view"
            aria-label="Grid view"
          >
            <Icon name="layoutGrid" size={13} />
          </button>
          <button
            type="button"
            className={`doc-view-btn ${viewMode === "list" ? "active" : ""}`}
            onClick={() => setView("list")}
            title="List view"
            aria-label="List view"
          >
            <Icon name="list" size={13} />
          </button>
        </div>
      </div>

      {/* ── Collapsible Documents Container Box ── */}
      <div className={`doc-collapsible-box ${docsCollapsed ? "is-collapsed" : ""}`}>
        <div
          className="doc-collapsible-header"
          onClick={() => setDocsCollapsed((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setDocsCollapsed((prev) => !prev);
            }
          }}
        >
          <div className="doc-collapsible-left">
            <button
              className="doc-collapse-toggle-btn"
              aria-label={docsCollapsed ? "Expand documents list" : "Collapse documents list"}
              onClick={(e) => {
                e.stopPropagation();
                setDocsCollapsed((prev) => !prev);
              }}
            >
              <Icon name={docsCollapsed ? "chevronRight" : "chevronDown"} size={16} />
            </button>
            <span className="doc-collapsible-title">
              {activeFolder ? folders.find((f) => f.id === activeFolder)?.name || "Collection Documents" : "All Documents"}
            </span>
            {selected.size > 0 && (
              <span className="doc-collapsible-selected-tag">
                {selected.size} selected
              </span>
            )}
          </div>

          {!docsCollapsed && (
            <div className="doc-collapsible-right" onClick={(e) => e.stopPropagation()}>
              {filteredDocs.length > 0 && (
                <button
                  className="doc-collapsible-action-btn"
                  onClick={() => toggleSelectAll(filteredDocs)}
                >
                  {selected.size === filteredDocs.length && filteredDocs.length > 0 ? "Deselect All" : "Select All"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Documents Content ── */}
        {!docsCollapsed && (
          <div className="doc-collapsible-body">
            {loading ? (
              <div className={viewMode === "grid" ? "doc-cards-grid" : "doc-table-view"}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="card doc-card-skel">
                    <Skeleton width="48px" height="48px" style={{ borderRadius: 8 }} />
                    <div className="stack" style={{ gap: 8, flex: 1, marginTop: 12 }}>
                      <Skeleton width="75%" height="16px" />
                      <Skeleton width="45%" height="12px" />
                      <Skeleton width="30%" height="20px" style={{ borderRadius: 12 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredDocs.length === 0 ? (
              <EmptyState
                icon="doc"
                title={
                  search
                    ? `No matches for "${search}"`
                    : activeFolder
                    ? "No documents in this folder"
                    : "Your knowledge base is empty"
                }
                hint={
                  search
                    ? "Try adjusting your search query or clear the filter."
                    : "Drop PDFs, Word documents, or lecture notes above to start studying with AI."
                }
                action={
                  (search || categoryFilter !== "all" || statusFilter !== "all") ? (
                    <Button
                      variant="secondary"
                      style={{ borderRadius: 999, fontSize: 12, padding: "5px 16px" }}
                      onClick={() => {
                        setSearch("");
                        setCategoryFilter("all");
                        setStatusFilter("all");
                      }}
                    >
                      Clear Filters
                    </Button>
                  ) : undefined
                }
              />
            ) : viewMode === "grid" ? (
              /* ── GRID VIEW ── */
              <div className="doc-cards-grid">
                {filteredDocs.map((d) => {
                  const cat = getFileCategory(d.original_filename, d.file_type);
                  const badge = getFileBadgeColor(cat);
                  const isSelected = selected.has(d.id);
                  const folder = folders.find((f) => f.id === d.folder_id);

                  return (
                    <div
                      key={d.id}
                      className={`doc-card ${isSelected ? "is-selected" : ""}`}
                      onClick={() => setInspectDoc(d)}
                    >
                      <div className="doc-card-top">
                        <div className="doc-card-type-tag">
                          <Icon name={cat === "image" ? "image" : "doc"} size={14} />
                          <span>{badge.label}</span>
                        </div>

                        <div className="doc-card-top-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="doc-hover-actions">
                            <button
                              className="doc-mini-btn"
                              title="Chat with document"
                              onClick={() => navigate(`/chat?doc=${d.id}`)}
                            >
                              <Icon name="chat" size={13} />
                            </button>
                            <button
                              className="doc-mini-btn"
                              title="Practice Quiz"
                              onClick={() => navigate(`/quiz?scope=${d.id}`)}
                            >
                              <Icon name="quiz" size={13} />
                            </button>
                            <button
                              className="doc-mini-btn"
                              title="Move to collection"
                              onClick={() => setMoveDoc(d)}
                            >
                              <Icon name="folderInput" size={13} />
                            </button>
                            <button
                              className="doc-mini-btn"
                              title="Rename"
                              onClick={() => openRename(d)}
                            >
                              <Icon name="edit" size={13} />
                            </button>
                            <button
                              className="doc-mini-btn btn-del"
                              title="Delete"
                              onClick={() => setDeleteDoc(d)}
                            >
                              <Icon name="trash" size={13} />
                            </button>
                          </div>

                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(d.id)}
                            className="doc-checkbox"
                            aria-label={`Select ${d.original_filename}`}
                          />
                        </div>
                      </div>

                      <div className="doc-card-body">
                        <h3 className="doc-card-title" title={d.original_filename}>
                          {d.original_filename}
                        </h3>

                        <div className="doc-card-meta">
                          <span>{formatBytes(d.file_size_bytes)}</span>
                          <span>·</span>
                          <span>{formatRelative(d.created_at.toString())}</span>
                          {d.page_count != null && (
                            <>
                              <span>·</span>
                              <span>{d.page_count} {d.page_count === 1 ? "page" : "pages"}</span>
                            </>
                          )}
                        </div>

                        {folder && (
                          <div className="doc-card-folder-tag">
                            <Icon name="folder" size={11} />
                            <span>{folder.name}</span>
                          </div>
                        )}
                      </div>

                      <div className="doc-card-foot" onClick={(e) => e.stopPropagation()}>
                        <StatusBadge status={d.processing_status} error={d.error_message} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── LIST / TABLE VIEW ── */
              <div className="doc-table-container">
                <table className="doc-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>
                        <input
                          type="checkbox"
                          checked={selected.size === filteredDocs.length && filteredDocs.length > 0}
                          onChange={() => toggleSelectAll(filteredDocs)}
                          aria-label="Select all documents"
                        />
                      </th>
                      <th>Name</th>
                      <th>Collection</th>
                      <th>Size</th>
                      <th>Pages</th>
                      <th>Status</th>
                      <th>Added</th>
                      <th style={{ width: 140, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map((d) => {
                      const cat = getFileCategory(d.original_filename, d.file_type);
                      const badge = getFileBadgeColor(cat);
                      const isSelected = selected.has(d.id);
                      const folder = folders.find((f) => f.id === d.folder_id);

                      return (
                        <tr
                          key={d.id}
                          className={`doc-table-row ${isSelected ? "is-selected" : ""}`}
                          onClick={() => setInspectDoc(d)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(d.id)}
                              aria-label={`Select ${d.original_filename}`}
                            />
                          </td>
                          <td>
                            <div className="doc-table-name-cell">
                              <span className="doc-table-badge">
                                <Icon name={cat === "image" ? "image" : "doc"} size={14} />
                              </span>
                              <span className="doc-table-filename" title={d.original_filename}>
                                {d.original_filename}
                              </span>
                            </div>
                          </td>
                          <td>
                            {folder ? (
                              <span className="doc-table-folder-pill">
                                <Icon name="folder" size={12} />
                                {folder.name}
                              </span>
                            ) : (
                              <span className="muted" style={{ fontSize: 12 }}>—</span>
                            )}
                          </td>
                          <td className="doc-table-dim">{formatBytes(d.file_size_bytes)}</td>
                          <td className="doc-table-dim">{d.page_count != null ? `${d.page_count} pp` : "—"}</td>
                          <td>
                            <StatusBadge status={d.processing_status} error={d.error_message} />
                          </td>
                          <td className="doc-table-dim">{formatDate(d.created_at.toString())}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="doc-table-actions">
                              <button
                                className="icon-btn"
                                title="Chat with document"
                                onClick={() => navigate(`/chat?doc=${d.id}`)}
                              >
                                <Icon name="chat" size={14} />
                              </button>
                              <button
                                className="icon-btn"
                                title="Quiz"
                                onClick={() => navigate(`/quiz?scope=${d.id}`)}
                              >
                                <Icon name="quiz" size={14} />
                              </button>
                              <button
                                className="icon-btn"
                                title="Move"
                                onClick={() => setMoveDoc(d)}
                              >
                                <Icon name="folderInput" size={14} />
                              </button>
                              <button
                                className="icon-btn"
                                title="Rename"
                                onClick={() => openRename(d)}
                              >
                                <Icon name="edit" size={14} />
                              </button>
                              <button
                                className="icon-btn"
                                title="Delete"
                                onClick={() => setDeleteDoc(d)}
                              >
                                <Icon name="trash" size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Floating Multi-Select Study Bar (Linear / Superhuman Style) ── */}
      {scopeIds.length > 0 && (
        <div className="doc-floating-bar">
          <div className="doc-floating-left">
            <span className="doc-floating-count">{scopeIds.length}</span>
            <span className="doc-floating-label">
              {scopeIds.length === 1 ? "document selected" : "documents selected"}
            </span>
          </div>

          <div className="doc-floating-actions">
            <button
              className="doc-floating-action-btn"
              onClick={() => study(scopeIds, "/chat")}
              title="Chat with selected"
            >
              <Icon name="chat" size={15} />
              <span>Chat ({scopeIds.length})</span>
            </button>

            <button
              className="doc-floating-action-btn"
              onClick={() => study(scopeIds, "/notes")}
              title="Generate Cornell notes"
            >
              <Icon name="notes" size={15} />
              <span>Notes</span>
            </button>

            <button
              className="doc-floating-action-btn"
              onClick={() => study(scopeIds, "/quiz")}
              title="Generate practice quiz"
            >
              <Icon name="quiz" size={15} />
              <span>Quiz</span>
            </button>

            <button
              className="doc-floating-action-btn"
              onClick={() => study(scopeIds, "/flashcards")}
              title="Generate flashcards"
            >
              <Icon name="card" size={15} />
              <span>Flashcards</span>
            </button>

            <div className="doc-floating-divider" />

            <button
              className="doc-floating-action-btn"
              onClick={() => setMoveSelectedOpen(true)}
              title="Move selected documents to a folder"
            >
              <Icon name="folderInput" size={15} />
              <span>Move</span>
            </button>

            <button
              className="doc-floating-action-btn doc-floating-btn-danger"
              onClick={() => setBulkDeleteOpen(true)}
              title="Delete selected documents"
            >
              <Icon name="trash" size={15} />
              <span>Delete</span>
            </button>

            <button
              className="doc-floating-close-btn"
              onClick={() => setSelected(new Set())}
              title="Clear selection"
              aria-label="Clear selection"
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Document Inspector Modal ── */}
      {inspectDoc && (
        <Modal
          open={!!inspectDoc}
          onClose={() => setInspectDoc(null)}
          title="Document Inspector"
        >
          <div className="doc-inspector-modal">
            <div className="doc-inspector-header">
              <div className="doc-inspector-icon">
                <Icon name="doc" size={26} />
              </div>
              <div className="doc-inspector-title-wrap">
                <h2 className="doc-inspector-title">{inspectDoc.original_filename}</h2>
                <div className="row" style={{ gap: 8, marginTop: 4 }}>
                  <StatusBadge status={inspectDoc.processing_status} error={inspectDoc.error_message} />
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    Added {formatDate(inspectDoc.created_at.toString())}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Study Launcher Grid */}
            <div className="doc-inspector-study-grid">
              <button
                className="doc-inspector-study-card"
                onClick={() => {
                  setInspectDoc(null);
                  navigate(`/chat?doc=${inspectDoc.id}`);
                }}
              >
                <span className="doc-study-ico doc-study-ico--blue">
                  <Icon name="chat" size={18} />
                </span>
                <span className="doc-study-label">Ask AI Tutor</span>
                <span className="doc-study-desc">Chat & ask grounded questions</span>
              </button>

              <button
                className="doc-inspector-study-card"
                onClick={() => {
                  setInspectDoc(null);
                  navigate(`/notes?scope=${inspectDoc.id}`);
                }}
              >
                <span className="doc-study-ico doc-study-ico--emerald">
                  <Icon name="notes" size={18} />
                </span>
                <span className="doc-study-label">Generate Notes</span>
                <span className="doc-study-desc">Cornell & revision summaries</span>
              </button>

              <button
                className="doc-inspector-study-card"
                onClick={() => {
                  setInspectDoc(null);
                  navigate(`/quiz?scope=${inspectDoc.id}`);
                }}
              >
                <span className="doc-study-ico doc-study-ico--amber">
                  <Icon name="quiz" size={18} />
                </span>
                <span className="doc-study-label">Practice Quiz</span>
                <span className="doc-study-desc">Test retention & mastery</span>
              </button>

              <button
                className="doc-inspector-study-card"
                onClick={() => {
                  setInspectDoc(null);
                  navigate(`/flashcards?scope=${inspectDoc.id}`);
                }}
              >
                <span className="doc-study-ico doc-study-ico--violet">
                  <Icon name="card" size={18} />
                </span>
                <span className="doc-study-label">Flashcards</span>
                <span className="doc-study-desc">Spaced repetition deck</span>
              </button>
            </div>

            {/* File Info Grid */}
            <div className="doc-inspector-meta-grid">
              <div className="doc-meta-cell">
                <span className="doc-meta-label">File Size</span>
                <span className="doc-meta-val">{formatBytes(inspectDoc.file_size_bytes)}</span>
              </div>
              <div className="doc-meta-cell">
                <span className="doc-meta-label">Format</span>
                <span className="doc-meta-val">{inspectDoc.file_type?.toUpperCase() || "DOCUMENT"}</span>
              </div>
              <div className="doc-meta-cell">
                <span className="doc-meta-label">Pages</span>
                <span className="doc-meta-val">{inspectDoc.page_count != null ? inspectDoc.page_count : "—"}</span>
              </div>
              <div className="doc-meta-cell">
                <span className="doc-meta-label">Folder</span>
                <span className="doc-meta-val">
                  {folders.find((f) => f.id === inspectDoc.folder_id)?.name || "Uncategorized (Root)"}
                </span>
              </div>
            </div>

            <div className="spread" style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <div className="row" style={{ gap: 8 }}>
                <Button
                  variant="secondary"
                  className="btn-sm"
                  onClick={() => {
                    const d = inspectDoc;
                    setInspectDoc(null);
                    setMoveDoc(d);
                  }}
                >
                  <Icon name="folderInput" size={14} /> Move Folder
                </Button>
                <Button
                  variant="secondary"
                  className="btn-sm"
                  onClick={() => {
                    const d = inspectDoc;
                    setInspectDoc(null);
                    openRename(d);
                  }}
                >
                  <Icon name="edit" size={14} /> Rename
                </Button>
              </div>

              <Button
                variant="danger"
                className="btn-sm"
                onClick={() => {
                  const d = inspectDoc;
                  setInspectDoc(null);
                  setDeleteDoc(d);
                }}
              >
                <Icon name="trash" size={14} /> Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Move Single Document Modal ── */}
      {moveDoc && (
        <Modal
          open={!!moveDoc}
          onClose={() => setMoveDoc(null)}
          title="Move to Folder"
        >
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
            Choose a destination collection for <strong>{moveDoc.original_filename}</strong>:
          </p>

          <div className="stack" style={{ gap: 6, maxHeight: 260, overflowY: "auto" }}>
            <button
              className={`doc-folder-option ${moveDoc.folder_id === null ? "is-selected" : ""}`}
              onClick={() => void commitMove(moveDoc.id, null)}
            >
              <Icon name="layers" size={15} />
              <span>Root (No Folder)</span>
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                className={`doc-folder-option ${moveDoc.folder_id === f.id ? "is-selected" : ""}`}
                onClick={() => void commitMove(moveDoc.id, f.id)}
              >
                <Icon name="folder" size={15} />
                <span>{f.name}</span>
              </button>
            ))}
          </div>

          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setMoveDoc(null)}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Move Selected Documents Bulk Modal ── */}
      {moveSelectedOpen && (
        <Modal
          open={moveSelectedOpen}
          onClose={() => setMoveSelectedOpen(false)}
          title={`Move ${selected.size} Documents`}
        >
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
            Select destination collection:
          </p>

          <div className="stack" style={{ gap: 6, maxHeight: 260, overflowY: "auto" }}>
            <button
              className={`doc-folder-option ${targetFolderId === null ? "is-selected" : ""}`}
              onClick={() => void commitBulkMove(null)}
            >
              <Icon name="layers" size={15} />
              <span>Root (No Folder)</span>
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                className={`doc-folder-option ${targetFolderId === f.id ? "is-selected" : ""}`}
                onClick={() => void commitBulkMove(f.id)}
              >
                <Icon name="folder" size={15} />
                <span>{f.name}</span>
              </button>
            ))}
          </div>

          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setMoveSelectedOpen(false)}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Create Folder Modal ── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Collection Folder">
        <Input
          label="Collection Name"
          value={newFolder}
          onChange={(e) => setNewFolder(e.target.value)}
          placeholder="e.g. Neuroscience 202, Organic Chemistry"
          onKeyDown={(e) => {
            if (e.key === "Enter") void createFolder();
          }}
        />
        <div className="row" style={{ marginTop: 14, justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void createFolder()} disabled={!newFolder.trim()}>
            Create Collection
          </Button>
        </div>
      </Modal>

      {/* ── Delete Single Document Modal ── */}
      <Modal open={!!deleteDoc} onClose={() => setDeleteDoc(null)} title="Delete Document">
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          Are you sure you want to delete <strong>{deleteDoc?.original_filename}</strong>?
          This permanently removes the file, extracted vectors, and grounded indexing.
        </p>
        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={() => setDeleteDoc(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void confirmDelete()}>
            Delete Permanently
          </Button>
        </div>
      </Modal>

      {/* ── Bulk Delete Modal ── */}
      <Modal open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} title="Delete Selected Documents">
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          Delete <strong>{selected.size} selected documents</strong> permanently from your workspace?
        </p>
        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void confirmBulkDelete()}>
            Delete All ({selected.size})
          </Button>
        </div>
      </Modal>

      {/* ── Rename Document Modal ── */}
      <Modal open={!!renameDoc} onClose={() => setRenameDoc(null)} title="Rename Document">
        <Input
          label="Document Name"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitRename();
          }}
        />
        <div className="row" style={{ marginTop: 14, justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={() => setRenameDoc(null)}>
            Cancel
          </Button>
          <Button onClick={() => void commitRename()} disabled={!renameValue.trim()}>
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}

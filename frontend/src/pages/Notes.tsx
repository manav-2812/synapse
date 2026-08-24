import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { studyApi } from "../api/study";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Button } from "../components/ui/Button";
import { DocumentScopePicker } from "../components/DocumentScopePicker";
import { Icon } from "../components/ui/Icon";
import { GenLoading } from "../components/ui/GenLoading";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { formatRelative } from "../lib/format";
import type { NoteResponse, NoteType } from "../types/api";

const FORMATS: { value: NoteType; label: string; icon: string; hint: string }[] = [
  { value: "short_notes",   label: "Short Notes",   icon: "stickyNote", hint: "Concise key bullet summary" },
  { value: "long_notes",    label: "Long Notes",    icon: "layers",     hint: "Detailed concept explanation" },
  { value: "exam_answer",   label: "Exam Answer",   icon: "exam",       hint: "Structured test-ready breakdown" },
  { value: "formula_sheet", label: "Formula Sheet", icon: "calculator", hint: "Key formulas & definitions" },
];

function cleanSnippet(text: string): string {
  if (!text) return "No content preview available.";
  const clean = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= 150) return clean || "No content preview available.";
  return clean.slice(0, 150).trimEnd() + "…";
}

function approxWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function Notes() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const scopeParam = params.get("scope");

  const [notes, setNotes] = useState<NoteResponse[]>([]);
  const [type, setType] = useState<NoteType>("short_notes");
  const [scopeIds, setScopeIds] = useState<string[]>(
    scopeParam ? scopeParam.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // Library controls
  const [libCollapsed, setLibCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | NoteType>("all");
  const [filterQuery, setFilterQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Deletion Modal
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<NoteResponse | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setNotes(await studyApi.listNotes());
    } catch (err) {
      toast("error", "Couldn't load notes", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const note = await studyApi.createNote(type, scopeIds);
      setNotes((prev) => [note, ...prev]);
      toast("success", "Note created", "Opening your new study note…");
      navigate(`/notes/${note.id}`);
    } catch (err) {
      toast("error", "Couldn't generate note", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(e: React.MouseEvent, note: NoteResponse) {
    e.stopPropagation();
    setDeleteNoteTarget(note);
  }

  async function executeDelete() {
    if (!deleteNoteTarget) return;
    setDeleteBusy(true);
    try {
      await studyApi.deleteNote(deleteNoteTarget.id);
      setNotes((prev) => prev.filter((n) => n.id !== deleteNoteTarget.id));
      toast("success", "Deleted", `"${deleteNoteTarget.title}" removed.`);
      setDeleteNoteTarget(null);
    } catch (err) {
      toast("error", "Couldn't delete note", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setDeleteBusy(false);
    }
  }

  // Filtered notes list
  const filteredNotes = useMemo(() => {
    let list = notes;
    if (activeTab !== "all") {
      list = list.filter((n) => n.note_type === activeTab);
    }
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase().trim();
      list = list.filter(
        (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
      );
    }
    return list;
  }, [notes, activeTab, filterQuery]);

  // Metric counts
  const shortCount = useMemo(() => notes.filter((n) => n.note_type === "short_notes").length, [notes]);
  const longCount = useMemo(() => notes.filter((n) => n.note_type === "long_notes").length, [notes]);
  const formulaCount = useMemo(() => notes.filter((n) => n.note_type === "formula_sheet").length, [notes]);
  const examCount = useMemo(() => notes.filter((n) => n.note_type === "exam_answer").length, [notes]);

  return (
    <div className="note-page-layout">
      {/* ── Page Header ── */}
      <div className="note-head">
        <div className="note-head-text">
          <h1 className="note-head-title">Study Notes & Synthesis</h1>
          <p className="note-head-sub">
            Summarize your documents into study-ready notes, Cornell sheets, and exam answers.
          </p>
        </div>
      </div>

      {/* ── Live Analytics Stats Strip ── */}
      <div className="note-stats-strip">
        <div className="note-stat-item">
          <div className="note-stat-icon-wrap">
            <Icon name="notebookPen" size={17} />
          </div>
          <div className="note-stat-content">
            <span className="note-stat-val">{notes.length}</span>
            <span className="note-stat-lbl">Total Notes</span>
          </div>
        </div>

        <div className="note-stat-item">
          <div className="note-stat-icon-wrap">
            <Icon name="stickyNote" size={17} />
          </div>
          <div className="note-stat-content">
            <span className="note-stat-val">{shortCount}</span>
            <span className="note-stat-lbl">Short Notes</span>
          </div>
        </div>

        <div className="note-stat-item">
          <div className="note-stat-icon-wrap">
            <Icon name="layers" size={17} />
          </div>
          <div className="note-stat-content">
            <span className="note-stat-val">{longCount}</span>
            <span className="note-stat-lbl">Long Summaries</span>
          </div>
        </div>

        <div className="note-stat-item">
          <div className="note-stat-icon-wrap">
            <Icon name="calculator" size={17} />
          </div>
          <div className="note-stat-content">
            <span className="note-stat-val">{formulaCount + examCount}</span>
            <span className="note-stat-lbl">Formulas & Exams</span>
          </div>
        </div>
      </div>

      {/* ── Generate Notes Executive Card ── */}
      <div className="note-generator-card">
        <div className="note-generator-head">
          <div>
            <h2 className="note-generator-title">Generate Study Notes</h2>
            <p className="note-generator-sub">
              Configure format and document scope to generate tailored summaries.
            </p>
          </div>
        </div>

        <div className="note-generator-grid">
          {/* Format Selector Pills */}
          <div className="note-gen-field">
            <span className="note-gen-label">Note Format</span>
            <div className="note-format-pills">
              {FORMATS.map((f) => {
                const isActive = type === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    className={`note-format-btn${isActive ? " active" : ""}`}
                    onClick={() => setType(f.value)}
                    title={f.hint}
                  >
                    <Icon name={f.icon} size={13} />
                    <span>{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scope Picker */}
          <div className="note-gen-field">
            <span className="note-gen-label">Target Material</span>
            <DocumentScopePicker value={scopeIds} onChange={setScopeIds} allowUpload />
          </div>
        </div>

        <div className="note-generator-foot">
          <span className="note-generator-hint">
            Grounded across {scopeIds.length === 0 ? "all knowledge base documents" : `${scopeIds.length} selected document(s)`}
          </span>
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy}
            className="btn-generate-notes-pill"
          >
            <Icon name="notes" size={16} />
            <span>{busy ? "Generating…" : "Generate Notes"}</span>
          </button>
        </div>
      </div>

      {/* ── Generation In Progress Indicator ── */}
      {busy && (
        <GenLoading
          label="Synthesizing notes"
          steps={[
            "Retrieving grounded document passages…",
            "Structuring core conceptual points…",
            "Generating key definitions and summaries…",
            "Finalizing markdown note…",
          ]}
        />
      )}

      {/* ── Collapsible Notes Library ── */}
      <div className={`doc-collapsible-box${libCollapsed ? " is-collapsed" : ""}`}>
        <div className="doc-collapsible-header" onClick={() => setLibCollapsed((prev) => !prev)}>
          <div className="doc-collapsible-left">
            <button
              type="button"
              className="doc-collapse-toggle-btn"
              aria-label={libCollapsed ? "Expand library" : "Collapse library"}
            >
              <Icon name={libCollapsed ? "chevronRight" : "chevronDown"} size={14} />
            </button>
            <span className="doc-collapsible-title">Notes Library</span>
          </div>

          {!libCollapsed && (
            <div className="doc-collapsible-right" onClick={(e) => e.stopPropagation()}>
              {/* Format Filter Tabs */}
              <div className="quiz-filter-tabs note-filter-pill-group">
                <button
                  type="button"
                  className={`quiz-tab-btn ${activeTab === "all" ? "active" : ""}`}
                  onClick={() => setActiveTab("all")}
                >
                  <Icon name="layoutGrid" size={12} />
                  <span>All ({notes.length})</span>
                </button>
                <button
                  type="button"
                  className={`quiz-tab-btn ${activeTab === "short_notes" ? "active" : ""}`}
                  onClick={() => setActiveTab("short_notes")}
                >
                  <Icon name="stickyNote" size={12} />
                  <span>Short ({shortCount})</span>
                </button>
                <button
                  type="button"
                  className={`quiz-tab-btn ${activeTab === "long_notes" ? "active" : ""}`}
                  onClick={() => setActiveTab("long_notes")}
                >
                  <Icon name="layers" size={12} />
                  <span>Long ({longCount})</span>
                </button>
                <button
                  type="button"
                  className={`quiz-tab-btn ${activeTab === "formula_sheet" ? "active" : ""}`}
                  onClick={() => setActiveTab("formula_sheet")}
                >
                  <Icon name="calculator" size={12} />
                  <span>Formulas ({formulaCount})</span>
                </button>
                <button
                  type="button"
                  className={`quiz-tab-btn ${activeTab === "exam_answer" ? "active" : ""}`}
                  onClick={() => setActiveTab("exam_answer")}
                >
                  <Icon name="exam" size={12} />
                  <span>Exams ({examCount})</span>
                </button>
              </div>

              {/* Live Search */}
              <div className="note-search-pill-wrap">
                <Icon name="search" size={13} className="note-search-pill-icon" />
                <input
                  type="text"
                  className="note-search-pill-input"
                  placeholder="Filter notes..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                />
                {filterQuery && (
                  <button
                    type="button"
                    className="note-search-pill-clear"
                    onClick={() => setFilterQuery("")}
                    title="Clear filter"
                  >
                    <Icon name="close" size={11} />
                  </button>
                )}
              </div>

              {/* View Switcher (Grid / List) */}
              <div className="doc-view-toggle">
                <button
                  type="button"
                  className={`doc-view-btn ${viewMode === "grid" ? "active" : ""}`}
                  onClick={() => setViewMode("grid")}
                  title="Grid view"
                  aria-label="Grid view"
                >
                  <Icon name="grid" size={13} />
                </button>
                <button
                  type="button"
                  className={`doc-view-btn ${viewMode === "list" ? "active" : ""}`}
                  onClick={() => setViewMode("list")}
                  title="List view"
                  aria-label="List view"
                >
                  <Icon name="list" size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {!libCollapsed && (
          <div className="doc-collapsible-body" style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 24 }}>
                <GenLoading
                  label="Loading notes"
                  steps={["Retrieving your notes…", "Preparing content…", "Almost ready…"]}
                />
              </div>
            ) : filteredNotes.length === 0 ? (
              <div style={{ padding: 32 }}>
                <EmptyState
                  icon="doc"
                  title={filterQuery ? `No notes matching "${filterQuery}"` : "No notes found in this category."}
                  action={
                    (filterQuery || activeTab !== "all") ? (
                      <Button
                        variant="secondary"
                        style={{ borderRadius: 999, fontSize: 12, padding: "5px 16px" }}
                        onClick={() => {
                          setFilterQuery("");
                          setActiveTab("all");
                        }}
                      >
                        Clear Filters
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : viewMode === "grid" ? (
              /* ── Grid View ── */
              <div className="note-cards-grid">
                {filteredNotes.map((n, idx) => {
                  const formatDef = FORMATS.find((f) => f.value === n.note_type);
                  const wordCount = approxWords(n.content);

                  return (
                    <div
                      key={n.id}
                      className="note-card"
                      style={{ "--i": idx } as CSSProperties}
                      onClick={() => navigate(`/notes/${n.id}`)}
                    >
                      <div className="note-card-head">
                        <span className="note-type-pill">
                          <Icon name={formatDef?.icon || "doc"} size={11} />
                          {formatDef?.label || n.note_type}
                        </span>

                        <div className="quiz-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="quiz-icon-btn btn-del"
                            aria-label={`Delete ${n.title}`}
                            onClick={(e) => confirmDelete(e, n)}
                            title="Delete note"
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="note-card-body">
                        <h3 className="note-card-title" title={n.title}>
                          {n.title || "Untitled Note"}
                        </h3>
                        <p className="note-card-snippet">{cleanSnippet(n.content)}</p>
                      </div>

                      <div className="note-card-foot">
                        <span className="note-card-meta">
                          <span>{wordCount} words</span>
                          <span>·</span>
                          <span>{formatRelative(n.created_at)}</span>
                        </span>

                        <Button
                          variant="secondary"
                          className="btn-sm"
                          style={{ fontSize: 11.5, padding: "3px 8px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/notes/${n.id}`);
                          }}
                        >
                          <Icon name="eye" size={12} /> Read
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── List View ── */
              <div className="note-lib-list">
                {filteredNotes.map((n) => {
                  const formatDef = FORMATS.find((f) => f.value === n.note_type);
                  const wordCount = approxWords(n.content);

                  return (
                    <div
                      key={n.id}
                      className="note-lib-row"
                      onClick={() => navigate(`/notes/${n.id}`)}
                    >
                      <div className="note-lib-row-left">
                        <div className="note-lib-icon">
                          <Icon name={formatDef?.icon || "doc"} size={15} />
                        </div>
                        <div className="note-lib-row-info">
                          <span className="note-lib-row-title">{n.title || "Untitled Note"}</span>
                          <div className="note-lib-row-meta">
                            <span className="note-type-pill" style={{ padding: "1px 5px", fontSize: 10.5 }}>
                              {formatDef?.label || n.note_type}
                            </span>
                            <span>{wordCount} words</span>
                            <span>·</span>
                            <span>{formatRelative(n.created_at)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="quiz-row-actions" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="secondary"
                          className="btn-sm"
                          style={{ fontSize: 11.5, padding: "3px 8px" }}
                          onClick={() => navigate(`/notes/${n.id}`)}
                        >
                          <Icon name="eye" size={12} /> Read
                        </Button>
                        <button
                          className="quiz-icon-btn btn-del"
                          aria-label={`Delete ${n.title}`}
                          onClick={(e) => confirmDelete(e, n)}
                          title="Delete note"
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Delete Note Confirmation Modal ── */}
      <Modal
        open={Boolean(deleteNoteTarget)}
        onClose={() => !deleteBusy && setDeleteNoteTarget(null)}
        title="Delete Note"
      >
        <div style={{ padding: "8px 0 16px" }}>
          <p style={{ color: "var(--text-h)", fontSize: 14, margin: "0 0 8px", fontWeight: 500 }}>
            Are you sure you want to delete "{deleteNoteTarget?.title}"?
          </p>
          <p style={{ color: "var(--text-faint)", fontSize: 12.5, margin: 0 }}>
            This study note and its summarized sections will be permanently removed.
          </p>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
          <Button
            variant="ghost"
            onClick={() => setDeleteNoteTarget(null)}
            disabled={deleteBusy}
            style={{ borderRadius: 999 }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void executeDelete()}
            loading={deleteBusy}
            style={{ borderRadius: 999 }}
          >
            Delete Note
          </Button>
        </div>
      </Modal>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { studyApi } from "../api/study";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Button } from "../components/ui/Button";
import { DocumentScopePicker } from "../components/DocumentScopePicker";
import { Input } from "../components/ui/Input";
import { Icon } from "../components/ui/Icon";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Tip } from "../components/Tip";
import { TIP } from "../components/tips";
import { formatDate } from "../lib/format";
import type { NoteResponse, NoteType } from "../types/api";

const TYPES: { value: NoteType; label: string; hint: string }[] = [
  { value: "short_notes", label: "Short notes", hint: "Concise bullet summary" },
  { value: "long_notes", label: "Long notes", hint: "Detailed explanation" },
  { value: "exam_answer", label: "Exam answer", hint: "Structured response" },
  { value: "formula_sheet", label: "Formula sheet", hint: "Key formulas & defs" },
];

/** Lightweight markdown → HTML renderer (no external dependency). */
function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const html: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) { html.push("</ul>"); inUl = false; }
    if (inOl) { html.push("</ol>"); inOl = false; }
  };

  const inline = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/__(.*?)__/g, "<strong>$1</strong>");

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Headings
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    if (h1 || h2 || h3) {
      closeLists();
      const level = h1 ? 1 : h2 ? 2 : 3;
      const text2 = (h1 ?? h2 ?? h3)![1];
      html.push(`<h${level} class="nc-h${level}">${inline(text2)}</h${level}>`);
      continue;
    }

    // Ordered list
    const ol = line.match(/^\d+\.\s+(.+)/);
    if (ol) {
      if (inUl) { html.push("</ul>"); inUl = false; }
      if (!inOl) { html.push("<ol class=\"nc-ol\">"); inOl = true; }
      html.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    // Unordered list
    const ul = line.match(/^[-*]\s+(.+)/);
    if (ul) {
      if (inOl) { html.push("</ol>"); inOl = false; }
      if (!inUl) { html.push("<ul class=\"nc-ul\">"); inUl = true; }
      html.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    closeLists();

    // Horizontal rule
    if (/^---+$/.test(line)) { html.push("<hr class=\"nc-hr\" />"); continue; }

    // Empty line → paragraph break
    if (line.trim() === "") { html.push("<div class=\"nc-gap\"></div>"); continue; }

    html.push(`<p class="nc-p">${inline(line)}</p>`);
  }

  closeLists();
  return html.join("\n");
}

/** Copy-to-clipboard button with tick feedback. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button className="note-copy-btn" onClick={copy} title={copied ? "Copied!" : "Copy to clipboard"}>
      <Icon name={copied ? "check" : "clipboard"} size={15} />
      <span>{copied ? "Copied!" : "Copy"}</span>
    </button>
  );
}

export default function Notes() {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const scopeParam = params.get("scope");

  const [notes, setNotes] = useState<NoteResponse[]>([]);
  const [type, setType] = useState<NoteType>("short_notes");
  const [scopeIds, setScopeIds] = useState<string[]>(
    scopeParam ? scopeParam.split(",").map((s) => s.trim()).filter(Boolean) : [],
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<NoteResponse | null>(null);
  const [editNote, setEditNote] = useState<NoteResponse | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setNotes(await studyApi.listNotes());
    } catch (err) {
      toast(
        "error",
        "Couldn't load notes",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const note = await studyApi.createNote(type, scopeIds);
      setNotes((prev) => [note, ...prev]);
      setView(note);
    } catch (err) {
      toast(
        "error",
        "Couldn't generate note",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    try {
      await studyApi.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (view?.id === id) setView(null);
    } catch (err) {
      toast(
        "error",
        "Couldn't delete note",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  function openEdit(n: NoteResponse) {
    setEditNote(n);
    setEditTitle(n.title);
    setEditContent(n.content);
  }

  async function commitEdit() {
    if (!editNote) return;
    const title = editTitle.trim();
    const content = editContent;
    if (!title) {
      toast("error", "Missing title", "A note needs a title.");
      return;
    }
    setEditBusy(true);
    try {
      const updated = await studyApi.updateNote(editNote.id, { title, content });
      setNotes((prev) => prev.map((n) => (n.id === editNote.id ? updated : n)));
      if (view?.id === editNote.id) setView(updated);
      setEditNote(null);
      toast("success", "Note updated", "Your changes were saved.");
    } catch (err) {
      toast(
        "error",
        "Couldn't update note",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <div className="stack">
      <Tip
        id={TIP.notesCreate}
        title="Summarize in one click"
        icon="doc"
      >
        Pick a document and Synapse turns it into structured, study-ready
        notes you can copy or export.
      </Tip>
      <div className="page-head spread">
        <div>
          <h1>Notes</h1>
          <p className="page-sub muted">Summarize your documents into study-ready notes.</p>
        </div>
      </div>

      <section className="card">
        <h2 className="section-title">Generate notes</h2>
        <div className="row wrap" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ margin: 0, minWidth: 170 }}>
            <span className="field-label">Type</span>
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value as NoteType)}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <span className="field-label">Document scope (optional)</span>
            <DocumentScopePicker
              value={scopeIds}
              onChange={setScopeIds}
              allowUpload
            />
          </label>
          <Button onClick={() => void create()} loading={busy}>
            <Icon name="doc" size={16} /> Generate
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="spinner-center">
          <Spinner />
        </div>
      ) : notes.length === 0 ? (
        <EmptyState icon="doc" title="No notes yet — generate a set above." />
      ) : (
        <div className="list">
          {notes.map((n) => (
            <div
              key={n.id}
              className="list-item list-item--clickable"
              onClick={() => setView(n)}
              role="button"
              tabIndex={0}
              aria-label={`Open ${n.title}`}
              onKeyDown={(e) => e.key === "Enter" && setView(n)}
            >
              <div className="li-main">
                <div className="li-title">{n.title}</div>
                <div className="li-sub">
                  {TYPES.find((t) => t.value === n.note_type)?.label ?? n.note_type} ·{" "}
                  {formatDate(n.created_at.toString())}
                </div>
              </div>
              <div className="li-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="icon-btn"
                  aria-label={`Edit ${n.title}`}
                  onClick={() => openEdit(n)}
                >
                  <Icon name="edit" size={16} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Delete ${n.title}`}
                  onClick={() => void del(n.id)}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Note viewer modal ── */}
      {view && (
        <div className="modal-overlay note-modal-overlay" onClick={() => setView(null)} role="presentation">
          <div className="modal note-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="note-modal-head">
              <div className="note-modal-meta">
                <span className="note-modal-type">
                  {TYPES.find((t) => t.value === view.note_type)?.label ?? view.note_type}
                </span>
                <h2 className="note-modal-title">{view.title}</h2>
                <span className="note-modal-date muted">{formatDate(view.created_at.toString())}</span>
              </div>
              <div className="note-modal-actions">
                <CopyButton text={view.content} />
                <button
                  className="icon-btn"
                  aria-label="Close"
                  onClick={() => setView(null)}
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            </div>
            {/* Body */}
            <div
              className="note-modal-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(view.content) }}
            />
            {/* Footer */}
            <div className="note-modal-foot">
              <Button variant="ghost" onClick={() => { setView(null); openEdit(view); }}>
                <Icon name="edit" size={14} /> Edit
              </Button>
              <Button variant="ghost" onClick={() => setView(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      <Modal open={!!editNote} onClose={() => setEditNote(null)} title="Edit note">
        <Input
          label="Title"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
        />
        <div className="field">
          <label className="field-label" htmlFor="note-content">Content</label>
          <textarea
            id="note-content"
            className="input"
            style={{ minHeight: 200, resize: "vertical", fontFamily: "var(--sans)" }}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
          />
        </div>
        <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => setEditNote(null)}>
            Cancel
          </Button>
          <Button onClick={() => void commitEdit()} loading={editBusy}>
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}

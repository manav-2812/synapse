import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { studyApi } from "../api/study";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Icon } from "../components/ui/Icon";
import { Modal } from "../components/ui/Modal";
import { formatDate } from "../lib/format";
import type { NoteResponse, NoteType } from "../types/api";

const TYPES: { value: NoteType; label: string }[] = [
  { value: "short_notes",   label: "Short notes"   },
  { value: "long_notes",    label: "Long notes"     },
  { value: "exam_answer",   label: "Exam answer"    },
  { value: "formula_sheet", label: "Formula sheet"  },
];

interface TocItem { id: string; level: number; text: string }

function renderMarkdownWithAnchors(text: string): { html: string; toc: TocItem[]; wordCount: number } {
  const lines = text.split("\n");
  const html: string[] = [];
  const toc: TocItem[] = [];
  let inUl = false;
  let inOl = false;
  let headingCount = 0;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  const closeLists = () => {
    if (inUl) { html.push("</ul>"); inUl = false; }
    if (inOl) { html.push("</ol>"); inOl = false; }
  };

  const inline = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,   "<em>$1</em>")
      .replace(/`([^`]+)`/g,   "<code>$1</code>")
      .replace(/__(.*?)__/g,   "<strong>$1</strong>");

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    if (h1 || h2 || h3) {
      closeLists();
      const level = h1 ? 1 : h2 ? 2 : 3;
      const text2 = (h1 ?? h2 ?? h3)![1].trim();
      const id = `heading-${++headingCount}-${text2.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
      toc.push({ id, level, text: text2.replace(/\*/g, "") });
      html.push(`<h${level} id="${id}" class="nc-h${level}">${inline(text2)}</h${level}>`);
      continue;
    }
    const ol = line.match(/^\d+\.\s+(.+)/);
    if (ol) {
      if (inUl) { html.push("</ul>"); inUl = false; }
      if (!inOl) { html.push('<ol class="nc-ol">'); inOl = true; }
      html.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    const ul = line.match(/^[-*]\s+(.+)/);
    if (ul) {
      if (inOl) { html.push("</ol>"); inOl = false; }
      if (!inUl) { html.push('<ul class="nc-ul">'); inUl = true; }
      html.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    closeLists();
    if (/^---+$/.test(line)) { html.push('<hr class="nc-hr" />'); continue; }
    if (line.trim() === "")  { html.push('<div class="nc-gap"></div>'); continue; }
    html.push(`<p class="nc-p">${inline(line)}</p>`);
  }
  closeLists();
  return { html: html.join("\n"), toc, wordCount };
}

export default function NoteReader() {
  const { id } = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const { toast } = useToast();

  const [note,    setNote]    = useState<NoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState(false);

  const [editOpen,    setEditOpen]    = useState(false);
  const [editTitle,   setEditTitle]   = useState("");
  const [editContent, setEditContent] = useState("");
  const [editBusy,    setEditBusy]    = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) { navigate("/notes", { replace: true }); return; }
    void (async () => {
      try {
        const all = await studyApi.listNotes();
        const found = all.find((n) => n.id === id) ?? null;
        if (!found) {
          toast("error", "Note not found", "It may have been deleted.");
          navigate("/notes", { replace: true });
          return;
        }
        setNote(found);
      } catch (err) {
        toast("error", "Couldn't load note", err instanceof ApiError ? err.message : "Please try again.");
        navigate("/notes", { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const { html, toc, wordCount } = useMemo(() => {
    if (!note) return { html: "", toc: [] as TocItem[], wordCount: 0 };
    return renderMarkdownWithAnchors(note.content);
  }, [note]);

  const readMinutes = Math.max(1, Math.round(wordCount / 200));

  function scrollToHeading(anchorId: string) {
    document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleCopy() {
    if (!note) return;
    void navigator.clipboard.writeText(note.content).then(() => {
      setCopied(true);
      toast("success", "Copied to clipboard", "Formatted note text copied.");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    if (!note) return;
    const safeTitle = note.title.replace(/[/\\?%*:|"<>]/g, "_").trim() || "Notes";
    const header = `# ${note.title}\n*Generated by Synapse on ${new Date().toLocaleDateString()}*\n\n---\n\n`;
    const blob = new Blob([header + note.content], { type: "text/markdown;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${safeTitle}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("success", "Downloaded", `Saved ${safeTitle}.md`);
  }

  function openEdit() {
    if (!note) return;
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditOpen(true);
  }

  async function commitEdit() {
    if (!note) return;
    const title   = editTitle.trim();
    const content = editContent;
    if (!title) { toast("error", "Missing title", "A note needs a title."); return; }
    setEditBusy(true);
    try {
      const updated = await studyApi.updateNote(note.id, { title, content });
      setNote(updated);
      setEditOpen(false);
      toast("success", "Saved", "Note updated.");
    } catch (err) {
      toast("error", "Couldn't save", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete() {
    if (!note) return;
    if (!window.confirm(`Delete "${note.title}"? This cannot be undone.`)) return;
    try {
      await studyApi.deleteNote(note.id);
      toast("success", "Deleted", "Note removed.");
      navigate("/notes");
    } catch (err) {
      toast("error", "Couldn't delete", err instanceof ApiError ? err.message : "Please try again.");
    }
  }

  if (loading) {
    return (
      <div className="nr-loading">
        <span className="spinner" role="status" aria-label="Loading note" />
        <span className="muted" style={{ fontSize: 14 }}>Loading note…</span>
      </div>
    );
  }

  if (!note) return null;

  const typeLabel = TYPES.find((t) => t.value === note.note_type)?.label ?? note.note_type;

  return (
    <div className="nr-page-container">
      {/* ── Top Header Toolbar Card ── */}
      <header className="nr-topbar-card card">
        <div className="nr-topbar-left">
          <button className="nr-back-btn" onClick={() => navigate("/notes")} aria-label="Back to notes">
            <Icon name="chevron" size={16} />
            <span>Notes</span>
          </button>
          <div className="nr-header-divider" />
          <div className="nr-header-meta">
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <span className="badge badge-accent">{typeLabel}</span>
              <span className="nr-header-date muted">{formatDate(note.created_at.toString())}</span>
              <span className="nr-header-readtime muted">· {readMinutes} min read ({wordCount} words)</span>
            </div>
            <h1 className="nr-main-title">{note.title}</h1>
          </div>
        </div>

        <div className="nr-topbar-actions">
          <button className="action-pill-btn btn-copy" onClick={handleCopy} title="Copy as Markdown">
            <Icon name={copied ? "check" : "copy"} size={14} />
            <span>{copied ? "Copied!" : "Copy"}</span>
          </button>
          <button className="action-pill-btn btn-markdown" onClick={handleDownload} title="Download .md file">
            <Icon name="download" size={14} />
            <span>Markdown</span>
          </button>
          <button className="action-pill-btn btn-print" onClick={() => window.print()} title="Print or Save as PDF">
            <Icon name="print" size={14} />
            <span>Print / PDF</span>
          </button>
          
          <div className="nr-actions-divider" />

          <button className="icon-btn" onClick={openEdit} title="Edit note">
            <Icon name="edit" size={16} />
          </button>
          <button className="icon-btn" onClick={() => void handleDelete()} title="Delete note" style={{ color: "var(--danger)" }}>
            <Icon name="trash" size={16} />
          </button>
          <button className="icon-btn nr-close-btn" onClick={() => navigate("/notes")} title="Close note" aria-label="Close note">
            <Icon name="close" size={18} />
          </button>
        </div>
      </header>

      {/* ── Main Layout: Table of Contents + Paper Document Canvas ── */}
      <div className="nr-layout">
        {toc.length > 0 && (
          <aside className="nr-toc-sidebar card">
            <div className="toc-header">
              <Icon name="book" size={14} />
              <span>Table of Contents</span>
            </div>
            <nav className="toc-nav">
              {toc.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`toc-link toc-level-${item.level}`}
                  onClick={() => scrollToHeading(item.id)}
                >
                  <span className="toc-dot" />
                  <span className="toc-text">{item.text}</span>
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* Paper Document Canvas */}
        <main className="nr-paper-canvas card" ref={contentRef}>
          {/* Print-Only Document Heading for Clean PDF Export */}
          <div className="nr-print-header">
            <div className="nr-print-brand">Synapse — AI Study Assistant</div>
            <h1 className="nr-print-title">{note.title}</h1>
            <div className="nr-print-meta">
              <span className="badge">{typeLabel}</span>
              <span>Generated on {formatDate(note.created_at.toString())}</span>
              <span>{wordCount} words</span>
            </div>
            <hr className="nr-print-divider" />
          </div>

          <div
            className="note-modal-body nr-document-content"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </main>
      </div>

      {/* ── Edit modal ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit note">
        <Input
          label="Title"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
        />
        <div className="field">
          <label className="field-label" htmlFor="nr-edit-content">Content</label>
          <textarea
            id="nr-edit-content"
            className="input"
            style={{ minHeight: 240, resize: "vertical", fontFamily: "var(--sans)" }}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
          />
        </div>
        <div className="row" style={{ marginTop: 8, justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={() => void commitEdit()} loading={editBusy}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}

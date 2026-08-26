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

  const inline = (s: string) => {
    let res = s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,   "<em>$1</em>")
      .replace(/`([^`]+)`/g,   "<code>$1</code>")
      .replace(/__(.*?)__/g,   "<strong>$1</strong>");

    // Automatically bold leading terms before colons in list items e.g. "Users Table: description"
    res = res.replace(/^([A-Za-z0-9\s&—–/,-]{2,35}):\s+/i, (match, p1) => {
      if (p1.includes("<strong")) return match;
      return `<strong>${p1}:</strong> `;
    });

    return res;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeLists();
      html.push('<div class="nc-gap"></div>');
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      closeLists();
      html.push('<hr class="nc-hr" />');
      continue;
    }

    // 1. Explicit Markdown Headings #, ##, ###, ####
    const hMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      closeLists();
      const level = Math.min(3, hMatch[1].length);
      const text2 = hMatch[2].trim().replace(/\*\*/g, "");
      const id = `heading-${++headingCount}-${text2.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
      toc.push({ id, level, text: text2 });
      html.push(`<h${level} id="${id}" class="nc-h${level}">${inline(hMatch[2].trim())}</h${level}>`);
      continue;
    }

    // 2. Standalone bold heading: **Heading Title**
    const boldHeadingMatch = trimmed.match(/^\*\*([^*]+)\*\*:?$/);
    if (boldHeadingMatch) {
      closeLists();
      const text2 = boldHeadingMatch[1].trim();
      const id = `heading-${++headingCount}-${text2.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
      toc.push({ id, level: 2, text: text2 });
      html.push(`<h2 id="${id}" class="nc-h2">${text2}</h2>`);
      continue;
    }

    // 3. Ordered list item: 1. Item
    const ol = line.match(/^\d+\.\s+(.+)/);
    if (ol) {
      if (inUl) { html.push("</ul>"); inUl = false; }
      if (!inOl) { html.push('<ol class="nc-ol">'); inOl = true; }
      html.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    // 4. Unordered list item: - Item or * Item or • Item
    const ul = line.match(/^[-*•]\s+(.+)/);
    if (ul) {
      if (inOl) { html.push("</ol>"); inOl = false; }
      if (!inUl) { html.push('<ul class="nc-ul">'); inUl = true; }
      html.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    // 5. Implicit Section Header (e.g. "Database Design Overview" followed by a list, < 65 chars, no period at end)
    const nextLine = lines[i + 1] ? lines[i + 1].trim() : "";
    const isNextList = nextLine.startsWith("-") || nextLine.startsWith("*") || nextLine.startsWith("•") || /^\d+\./.test(nextLine);
    const isHeadingLike =
      trimmed.length >= 3 &&
      trimmed.length <= 65 &&
      !trimmed.endsWith(".") &&
      !trimmed.endsWith(",") &&
      !trimmed.startsWith("-") &&
      !trimmed.startsWith("*") &&
      (isNextList || (i > 0 && lines[i - 1].trim() === ""));

    if (isHeadingLike) {
      closeLists();
      const text2 = trimmed.replace(/:$/, "").replace(/\*\*/g, "");
      const id = `heading-${++headingCount}-${text2.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
      toc.push({ id, level: 2, text: text2 });
      html.push(`<h2 id="${id}" class="nc-h2">${inline(trimmed)}</h2>`);
      continue;
    }

    // 6. Normal Paragraph
    closeLists();
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
  const [downloadingPdf, setDownloadingPdf] = useState(false);

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
  }, [id, navigate, toast]);

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

  function handleDownloadMarkdown() {
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

  function handleDownloadDocx() {
    if (!note) return;
    const safeTitle = note.title.replace(/[/\\?%*:|"<>]/g, "_").trim() || "Notes";
    const dateStr = formatDate(note.created_at.toString());
    const typeLabel = TYPES.find((t) => t.value === note.note_type)?.label ?? note.note_type;

    const wordHtml = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>${note.title}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body {
      font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.65;
      color: #1a1a1a;
      margin: 1in;
    }
    h1 {
      font-size: 22pt;
      color: #1e3a8a;
      margin-bottom: 6pt;
      font-weight: bold;
    }
    .doc-meta {
      font-size: 10pt;
      color: #6b7280;
      margin-bottom: 18pt;
      border-bottom: 1pt solid #e5e7eb;
      padding-bottom: 8pt;
    }
    h2 {
      font-size: 14pt;
      color: #111827;
      margin-top: 18pt;
      margin-bottom: 6pt;
      font-weight: bold;
    }
    h3 {
      font-size: 12pt;
      color: #2563eb;
      margin-top: 12pt;
      margin-bottom: 4pt;
      font-weight: bold;
    }
    p {
      margin-top: 0;
      margin-bottom: 8pt;
      text-align: justify;
    }
    ul, ol {
      margin-top: 4pt;
      margin-bottom: 10pt;
      padding-left: 24pt;
    }
    li {
      margin-bottom: 4pt;
      text-align: justify;
    }
    strong {
      color: #0f172a;
      font-weight: bold;
    }
    code {
      font-family: Consolas, 'Courier New', monospace;
      background-color: #f1f5f9;
      padding: 2pt 4pt;
      font-size: 9.5pt;
    }
  </style>
</head>
<body>
  <h1>${note.title}</h1>
  <div class="doc-meta">
    <strong>Type:</strong> ${typeLabel} &nbsp;|&nbsp; 
    <strong>Generated by:</strong> Synapse AI Study Assistant &nbsp;|&nbsp; 
    <strong>Date:</strong> ${dateStr} &nbsp;|&nbsp; 
    <strong>Word Count:</strong> ${wordCount} words
  </div>
  <div>
    ${html}
  </div>
</body>
</html>`;

    const blob = new Blob(['\ufeff' + wordHtml], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("success", "DOCX Downloaded", `Saved ${safeTitle}.docx`);
  }

  async function handleDownloadPdf() {
    if (!note || !contentRef.current) return;
    setDownloadingPdf(true);
    toast("info", "Generating PDF…", "Preparing your document for download.");

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const safeTitle = note.title.replace(/[/\\?%*:|"<>]/g, "_").trim() || "Notes";
      const element = contentRef.current;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        onclone: (clonedDoc) => {
          const printHeader = clonedDoc.querySelector(".nr-print-header") as HTMLElement | null;
          if (printHeader) {
            printHeader.style.display = "block";
            printHeader.style.marginBottom = "24px";
            printHeader.style.paddingBottom = "14px";
            printHeader.style.borderBottom = "2px solid #e5e7eb";
          }
          const canvasEl = clonedDoc.querySelector(".nr-paper-canvas") as HTMLElement | null;
          if (canvasEl) {
            canvasEl.style.boxShadow = "none";
            canvasEl.style.border = "none";
            canvasEl.style.padding = "40px 48px";
            canvasEl.style.color = "#111827";
            canvasEl.style.backgroundColor = "#ffffff";
          }
          const contentEls = clonedDoc.querySelectorAll(".nr-document-content, .nc-p, .nc-ul li, .nc-ol li, .nc-h1, .nc-h2, .nc-h3");
          contentEls.forEach((el) => {
            const h = el as HTMLElement;
            h.style.color = "#111827";
            h.style.opacity = "1";
          });
        },
      });

      const imgWidth = 595.28; // A4 pt width
      const pageHeight = 841.89; // A4 pt height
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });

      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;

      // Add subsequent pages if note spans multiple pages
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
        heightLeft -= pageHeight;
      }

      pdf.save(`${safeTitle}.pdf`);
      toast("success", "PDF Downloaded", `Saved ${safeTitle}.pdf`);
    } catch (err) {
      toast("error", "PDF Generation Failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setDownloadingPdf(false);
    }
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
          <button
            className="action-pill-btn btn-pdf"
            onClick={() => void handleDownloadPdf()}
            disabled={downloadingPdf}
            title="Download full note as PDF file"
          >
            <Icon name="download" size={14} />
            <span>{downloadingPdf ? "Generating…" : "PDF"}</span>
          </button>
          <button
            className="action-pill-btn btn-word"
            onClick={handleDownloadDocx}
            title="Download full note as Microsoft Word document (.docx)"
          >
            <Icon name="download" size={14} />
            <span>DOCX</span>
          </button>
          <button
            className="action-pill-btn btn-markdown"
            onClick={handleDownloadMarkdown}
            title="Download full note as Markdown (.md) file"
          >
            <Icon name="download" size={14} />
            <span>Markdown</span>
          </button>
          <button
            className="action-pill-btn btn-copy"
            onClick={handleCopy}
            title="Copy formatted markdown text"
          >
            <Icon name={copied ? "check" : "copy"} size={14} />
            <span>{copied ? "Copied!" : "Copy"}</span>
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

import { useState, useEffect } from "react";
import { Icon } from "./ui/Icon";
import { Button } from "./ui/Button";
import { studyApi } from "../api/study";
import { authApi } from "../api/auth";
import { useToast } from "../hooks/useToast";

interface Props {
  userName?: string;
  userEmail?: string;
  onClose: () => void;
}

export function ExportDataModal({ userName, userEmail, onClose }: Props) {
  const { toast } = useToast();

  const [includeFlashcards, setIncludeFlashcards] = useState(true);
  const [includeQuizzes, setIncludeQuizzes] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeChats, setIncludeChats] = useState(false);

  const [format, setFormat] = useState<"markdown" | "json">("markdown");
  const [loading, setLoading] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const selectedCount = [includeFlashcards, includeQuizzes, includeNotes, includeChats].filter(Boolean).length;

  async function handleExport() {
    if (selectedCount === 0) {
      toast("error", "Selection required", "Please select at least one item to export.");
      return;
    }

    setLoading(true);
    try {
      const timestamp = new Date().toISOString();
      const dateStr = timestamp.slice(0, 10);

      if (format === "json") {
        const fullServerExport = await authApi.exportData();
        const payload: Record<string, any> = { ...fullServerExport };
        if (!includeFlashcards) delete payload.flashcards;
        if (!includeQuizzes) delete payload.quizzes;
        if (!includeNotes) delete payload.study_notes;
        if (!includeChats) delete payload.conversations;

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `synapse-gdpr-export-${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const [flashcardsRes, quizzesRes, notesRes] = await Promise.allSettled([
          includeFlashcards ? studyApi.listFlashcards() : Promise.resolve([]),
          includeQuizzes ? studyApi.listQuizzes() : Promise.resolve([]),
          includeNotes ? studyApi.listNotes() : Promise.resolve([]),
        ]);

        const flashcards = flashcardsRes.status === "fulfilled" ? flashcardsRes.value : [];
        const quizzes = quizzesRes.status === "fulfilled" ? quizzesRes.value : [];
        const notes = notesRes.status === "fulfilled" ? notesRes.value : [];
        // Markdown format
        let md = `# Synapse Workspace Study Export\n\n`;
        md += `*Exported on: ${new Date().toLocaleDateString()} for ${userName || "User"} (${userEmail || ""})*\n\n---\n\n`;

        if (includeNotes) {
          md += `## 📝 Notes\n\n`;
          if (notes.length === 0) {
            md += `*No notes currently saved.*\n\n`;
          } else {
            notes.forEach((n: any, idx: number) => {
              md += `### ${idx + 1}. ${n.title || "Study Note"}\n`;
              if (n.summary) md += `**Summary:** ${n.summary}\n\n`;
              if (n.content) md += `${n.content}\n\n`;
              md += `---\n\n`;
            });
          }
        }

        if (includeFlashcards) {
          md += `## 🗂️ Flashcards\n\n`;
          if (flashcards.length === 0) {
            md += `*No flashcards currently created.*\n\n`;
          } else {
            flashcards.forEach((f: any, idx: number) => {
              md += `**Q${idx + 1}:** ${f.front || f.question || "Question"}\n\n`;
              md += `> **A:** ${f.back || f.answer || "Answer"}\n\n`;
            });
            md += `---\n\n`;
          }
        }

        if (includeQuizzes) {
          md += `## ❓ Quizzes\n\n`;
          if (quizzes.length === 0) {
            md += `*No quizzes currently created.*\n\n`;
          } else {
            quizzes.forEach((q: any, qIdx: number) => {
              md += `### Quiz ${qIdx + 1}: ${q.title || "Practice Quiz"}\n\n`;
              const questions = q.questions || [];
              questions.forEach((item: any, i: number) => {
                md += `**${i + 1}. ${item.question}**\n`;
                if (item.options && Array.isArray(item.options)) {
                  item.options.forEach((opt: string) => {
                    const isCorrect = opt === item.correct_answer;
                    md += `- [${isCorrect ? "x" : " "}] ${opt}${isCorrect ? " *(Correct)*" : ""}\n`;
                  });
                }
                if (item.explanation) md += `\n*Explanation:* ${item.explanation}\n`;
                md += `\n`;
              });
              md += `---\n\n`;
            });
          }
        }

        if (includeChats) {
          md += `## 💬 Chats\n\n`;
          md += `*Study conversation logs and reasoning threads.*\n\n`;
        }

        const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `synapse-study-export-${dateStr}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }

      toast("success", "Export downloaded", `Exported ${selectedCount} items in ${format.toUpperCase()} format.`);
      onClose();
    } catch (err: any) {
      toast("error", "Export failed", err?.message || "Failed to download study data.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="export-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-title"
    >
      <div className="export-modal">
        {/* Header */}
        <div className="export-modal-head">
          <div className="export-modal-icon">
            <Icon name="download" size={18} />
          </div>
          <div className="export-modal-title-wrap">
            <h2 className="export-modal-title" id="export-title">
              Export Study Data
            </h2>
            <p className="export-modal-desc">
              Select what you want to download and pick your preferred format.
            </p>
          </div>
          <button className="export-modal-close" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={15} />
          </button>
        </div>

        {/* 2x2 Interactive Material Selection Grid */}
        <div className="export-modal-section">
          <span className="export-section-label">Select materials</span>
          <div className="export-grid">
            {/* Flashcards */}
            <div
              className={`export-grid-card${includeFlashcards ? " active" : ""}`}
              onClick={() => setIncludeFlashcards((s) => !s)}
              role="checkbox"
              aria-checked={includeFlashcards}
              tabIndex={0}
              onKeyDown={(e) => e.key === " " && setIncludeFlashcards((s) => !s)}
            >
              <div className="export-card-top">
                <div className="export-card-icon icon-flashcards">
                  <Icon name="layers" size={16} />
                </div>
                <div className="export-card-check">
                  {includeFlashcards && <Icon name="check" size={12} />}
                </div>
              </div>
              <div className="export-card-info">
                <span className="export-card-title">Flashcards</span>
                <span className="export-card-desc">Question &amp; answer review sets</span>
              </div>
            </div>

            {/* Quizzes */}
            <div
              className={`export-grid-card${includeQuizzes ? " active" : ""}`}
              onClick={() => setIncludeQuizzes((s) => !s)}
              role="checkbox"
              aria-checked={includeQuizzes}
              tabIndex={0}
              onKeyDown={(e) => e.key === " " && setIncludeQuizzes((s) => !s)}
            >
              <div className="export-card-top">
                <div className="export-card-icon icon-quizzes">
                  <Icon name="quiz" size={16} />
                </div>
                <div className="export-card-check">
                  {includeQuizzes && <Icon name="check" size={12} />}
                </div>
              </div>
              <div className="export-card-info">
                <span className="export-card-title">Quizzes</span>
                <span className="export-card-desc">Questions, options &amp; solutions</span>
              </div>
            </div>

            {/* Notes */}
            <div
              className={`export-grid-card${includeNotes ? " active" : ""}`}
              onClick={() => setIncludeNotes((s) => !s)}
              role="checkbox"
              aria-checked={includeNotes}
              tabIndex={0}
              onKeyDown={(e) => e.key === " " && setIncludeNotes((s) => !s)}
            >
              <div className="export-card-top">
                <div className="export-card-icon icon-notes">
                  <Icon name="notes" size={16} />
                </div>
                <div className="export-card-check">
                  {includeNotes && <Icon name="check" size={12} />}
                </div>
              </div>
              <div className="export-card-info">
                <span className="export-card-title">Notes</span>
                <span className="export-card-desc">Document notes &amp; takeaways</span>
              </div>
            </div>

            {/* Chats */}
            <div
              className={`export-grid-card${includeChats ? " active" : ""}`}
              onClick={() => setIncludeChats((s) => !s)}
              role="checkbox"
              aria-checked={includeChats}
              tabIndex={0}
              onKeyDown={(e) => e.key === " " && setIncludeChats((s) => !s)}
            >
              <div className="export-card-top">
                <div className="export-card-icon icon-chats">
                  <Icon name="chat" size={16} />
                </div>
                <div className="export-card-check">
                  {includeChats && <Icon name="check" size={12} />}
                </div>
              </div>
              <div className="export-card-info">
                <span className="export-card-title">Chats</span>
                <span className="export-card-desc">AI assistant study discussions</span>
              </div>
            </div>
          </div>
        </div>

        {/* Format selector */}
        <div className="export-modal-section">
          <span className="export-section-label">File format</span>
          <div className="export-format-grid">
            <button
              type="button"
              className={`export-format-btn${format === "markdown" ? " active" : ""}`}
              onClick={() => setFormat("markdown")}
            >
              <div className="export-format-header">
                <Icon name="doc" size={15} />
                <span className="export-format-title">Markdown (.md)</span>
              </div>
              <span className="export-format-sub">Formatted document for Notion, Obsidian, or reading</span>
            </button>

            <button
              type="button"
              className={`export-format-btn${format === "json" ? " active" : ""}`}
              onClick={() => setFormat("json")}
            >
              <div className="export-format-header">
                <Icon name="hardDrive" size={15} />
                <span className="export-format-title">JSON Archive (.json)</span>
              </div>
              <span className="export-format-sub">Structured raw dataset for backup and migration</span>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="export-modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleExport()}
            loading={loading}
            disabled={selectedCount === 0}
          >
            <Icon name="download" size={14} />
            <span>Download ({selectedCount} selected)</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

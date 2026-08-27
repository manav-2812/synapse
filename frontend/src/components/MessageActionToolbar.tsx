import { useState } from "react";
import { Icon } from "./ui/Icon";
import { useToast } from "../hooks/useToast";
import { studyApi } from "../api/study";
import { useNavigate } from "react-router-dom";

interface MessageActionToolbarProps {
  role: "user" | "assistant";
  content: string;
  scopeIds: string[];
  onDelete: () => void;
  onRegenerate?: () => void;
}

export function MessageActionToolbar({
  role,
  content,
  scopeIds,
  onDelete,
  onRegenerate,
}: MessageActionToolbarProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [studyMenuOpen, setStudyMenuOpen] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);

  function handleFeedback(type: "up" | "down") {
    if (feedback === type) {
      setFeedback(null);
    } else {
      setFeedback(type);
      toast(
        "success",
        type === "up" ? "Thanks for the feedback!" : "Feedback recorded",
        type === "up" ? "Glad this was helpful." : "We'll work on improving answers."
      );
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast("success", "Copied to clipboard", "Message markdown copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("error", "Copy failed", "Could not access clipboard.");
    }
  }

  async function handleCreateFlashcards() {
    setConverting("cards");
    setStudyMenuOpen(false);
    try {
      await studyApi.generateFlashcards(5, scopeIds.length > 0 ? scopeIds : null);
      toast(
        "success",
        "Flashcards generated",
        "Created active recall flashcards from this topic.",
      );
      navigate("/flashcards");
    } catch (err: unknown) {
      toast(
        "error",
        "Generation failed",
        err instanceof Error ? err.message : "Could not generate flashcards.",
      );
    } finally {
      setConverting(null);
    }
  }

  async function handleCreateQuiz() {
    setConverting("quiz");
    setStudyMenuOpen(false);
    try {
      await studyApi.generateQuiz("medium", 5, scopeIds.length > 0 ? scopeIds : null);
      toast(
        "success",
        "Quiz generated",
        "Created an exam practice quiz on this material.",
      );
      navigate("/quiz");
    } catch (err: unknown) {
      toast(
        "error",
        "Generation failed",
        err instanceof Error ? err.message : "Could not generate quiz.",
      );
    } finally {
      setConverting(null);
    }
  }

  async function handleCreateNotes() {
    setConverting("notes");
    setStudyMenuOpen(false);
    try {
      await studyApi.createNote("short_notes", scopeIds.length > 0 ? scopeIds : null);
      toast(
        "success",
        "Study notes created",
        "Generated structured summary notes.",
      );
      navigate("/notes");
    } catch (err: unknown) {
      toast(
        "error",
        "Generation failed",
        err instanceof Error ? err.message : "Could not generate notes.",
      );
    } finally {
      setConverting(null);
    }
  }

  return (
    <div className={`msg-action-toolbar ${role}`}>
      <button
        className="icon-btn action-btn"
        title="Copy markdown"
        aria-label="Copy markdown"
        onClick={handleCopy}
      >
        <Icon name={copied ? "check" : "copy"} size={13} />
      </button>

      {role === "assistant" && onRegenerate && (
        <button
          className="icon-btn action-btn"
          title="Regenerate response"
          aria-label="Regenerate response"
          onClick={onRegenerate}
        >
          <Icon name="refresh" size={13} />
        </button>
      )}

      {role === "assistant" && (
        <>
          <button
            className={`icon-btn action-btn ${feedback === "up" ? "active" : ""}`}
            title="Good response"
            aria-label="Good response"
            onClick={() => handleFeedback("up")}
          >
            <Icon name="thumbsUp" size={13} />
          </button>
          <button
            className={`icon-btn action-btn ${feedback === "down" ? "active" : ""}`}
            title="Poor response"
            aria-label="Poor response"
            onClick={() => handleFeedback("down")}
          >
            <Icon name="thumbsDown" size={13} />
          </button>
        </>
      )}

      {role === "assistant" && (
        <div className="study-menu-container">
          <button
            className={`icon-btn action-btn ${studyMenuOpen ? "active" : ""}`}
            title="Convert to Study Set"
            aria-label="Convert to Study Set"
            onClick={() => setStudyMenuOpen((o) => !o)}
          >
            <Icon name="sparkles" size={13} />
            <span className="action-btn-text">Study</span>
          </button>

          {studyMenuOpen && (
            <div className="study-popover" onMouseLeave={() => setStudyMenuOpen(false)}>
              <div className="study-popover-title">Create from answer</div>
              <button
                className="study-popover-item"
                onClick={handleCreateFlashcards}
                disabled={converting !== null}
              >
                <Icon name="card" size={14} />
                <div className="spi-text">
                  <span className="spi-name">Flashcards</span>
                  <span className="spi-desc">5 active-recall cards (SM-2)</span>
                </div>
              </button>
              <button
                className="study-popover-item"
                onClick={handleCreateQuiz}
                disabled={converting !== null}
              >
                <Icon name="quiz" size={14} />
                <div className="spi-text">
                  <span className="spi-name">Practice Quiz</span>
                  <span className="spi-desc">5 MCQ / short-answer questions</span>
                </div>
              </button>
              <button
                className="study-popover-item"
                onClick={handleCreateNotes}
                disabled={converting !== null}
              >
                <Icon name="notes" size={14} />
                <div className="spi-text">
                  <span className="spi-name">Structured Notes</span>
                  <span className="spi-desc">Summary & key definitions</span>
                </div>
              </button>
            </div>
          )}
        </div>
      )}



      <button
        className="icon-btn action-btn"
        title="Delete message"
        aria-label="Delete message"
        onClick={onDelete}
      >
        <Icon name="trash" size={13} />
      </button>

      {converting && (
        <span className="action-converting-indicator">
          Generating {converting}…
        </span>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { studyApi } from "../api/study";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Icon } from "../components/ui/Icon";
import { Modal } from "../components/ui/Modal";
import { GenLoading } from "../components/ui/GenLoading";
import { EmptyState } from "../components/ui/EmptyState";
import { DocumentScopePicker } from "../components/DocumentScopePicker";
import { formatDate } from "../lib/format";
import type {
  Difficulty,
  QuizResponse,
  QuizResultResponse,
} from "../types/api";

const ATTEMPTS_KEY = "synapse_quiz_attempts";

function saveQuizAttempt(quizId: string, res: QuizResultResponse) {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    const map: Record<string, QuizResultResponse> = raw ? JSON.parse(raw) : {};
    map[String(quizId)] = res;
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(map));
  } catch {}
}

function getQuizAttempt(quizId: string): QuizResultResponse | null {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return null;
    const map: Record<string, QuizResultResponse> = JSON.parse(raw);
    return map[String(quizId)] || map[quizId.toLowerCase()] || null;
  } catch {
    return null;
  }
}

type Mode = "list" | "taking" | "result" | "review";
type TakingView = "focus" | "all";

export default function Quiz() {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const scopeParam = params.get("scope");

  const [mode, setMode] = useState<Mode>("list");
  const [takingView, setTakingView] = useState<TakingView>("focus");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [quizzes, setQuizzes] = useState<QuizResponse[]>([]);
  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<QuizResultResponse | null>(null);
  const [lastAttempt, setLastAttempt] = useState<QuizResultResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedExplains, setExpandedExplains] = useState<Record<string, boolean>>({});

  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [count, setCount] = useState(5);
  const [countStr, setCountStr] = useState("5");
  const [scopeIds, setScopeIds] = useState<string[]>(
    scopeParam ? scopeParam.split(",").map((s) => s.trim()).filter(Boolean) : [],
  );

  useEffect(() => {
    const p = params.get("scope") || params.get("doc");
    if (p) {
      const ids = p.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        setScopeIds(ids);
      }
    }
  }, [params]);

  const [renameQuizId, setRenameQuizId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [quizSearch, setQuizSearch] = useState("");
  const [diffFilter, setDiffFilter] = useState<string>("all");
  const [isQuizzesCollapsed, setIsQuizzesCollapsed] = useState(false);

  const loadQuizzes = useCallback(async () => {
    try {
      setQuizzes(await studyApi.listQuizzes());
    } catch (err) {
      toast(
        "error",
        "Couldn't load quizzes",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }, [toast]);

  useEffect(() => {
    void loadQuizzes();
  }, [loadQuizzes]);

  // Keyboard shortcut listener for Quiz taking
  useEffect(() => {
    if (mode !== "taking" || !quiz || takingView !== "focus") return;

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const q = quiz?.questions[currentIdx];
      if (!q) return;

      // 1-4 or A-D for options
      if (q.options && q.options.length > 0) {
        const key = e.key.toLowerCase();
        let optIndex = -1;
        if (key === "1" || key === "a") optIndex = 0;
        else if (key === "2" || key === "b") optIndex = 1;
        else if (key === "3" || key === "c") optIndex = 2;
        else if (key === "4" || key === "d") optIndex = 3;

        if (optIndex >= 0 && optIndex < q.options.length) {
          e.preventDefault();
          setAnswer(currentIdx, q.options[optIndex]);
          return;
        }
      }

      // Arrow navigation
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIdx((c) => Math.max(0, c - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentIdx((c) => Math.min(quiz.questions.length - 1, c + 1));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, quiz, currentIdx, answers, takingView]);

  async function generate() {
    setBusy(true);
    try {
      const q = await studyApi.generateQuiz(difficulty, count, scopeIds);
      setQuiz(q);
      setAnswers(new Array(q.questions.length).fill(""));
      setCurrentIdx(0);
      setMode("taking");
      setTakingView("focus");
    } catch (err) {
      toast(
        "error",
        "Couldn't generate quiz",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!quiz) return;
    if (answers.some((a) => a.trim() === "")) {
      toast("info", "Unanswered questions", "Please answer every question before submitting.");
      return;
    }
    setBusy(true);
    try {
      const r = await studyApi.submitQuiz(quiz.id, answers);
      setResult(r);
      setLastAttempt(r);
      saveQuizAttempt(quiz.id, r);
      setMode("result");
      setCurrentIdx(0);
      void loadQuizzes();
    } catch (err) {
      toast(
        "error",
        "Couldn't submit quiz",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function review(id: string) {
    try {
      const q = await studyApi.getQuiz(id);
      setQuiz(q);
      const prevAttempt = getQuizAttempt(id);
      setLastAttempt(prevAttempt);
      setMode("review");
      setCurrentIdx(0);
    } catch (err) {
      toast(
        "error",
        "Couldn't open quiz",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function del(id: string) {
    try {
      await studyApi.deleteQuiz(id);
      setQuizzes((prev) => prev.filter((q) => q.id !== id));
      toast("success", "Deleted", "Quiz removed.");
    } catch (err) {
      toast(
        "error",
        "Couldn't delete quiz",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  function setAnswer(i: number, value: string) {
    setAnswers((prev) => prev.map((a, idx) => (idx === i ? value : a)));
  }

  function toggleExplain(questionId: string) {
    setExpandedExplains((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  }

  function openRename(q: QuizResponse) {
    setRenameQuizId(q.id);
    setRenameValue(q.title);
  }

  async function commitRename() {
    if (!renameQuizId) return;
    const title = renameValue.trim();
    if (!title) {
      toast("error", "Missing title", "A quiz needs a title.");
      return;
    }
    setRenameBusy(true);
    try {
      const updated = await studyApi.updateQuiz(renameQuizId, { title });
      setQuizzes((prev) => prev.map((q) => (q.id === renameQuizId ? updated : q)));
      setRenameQuizId(null);
      toast("success", "Quiz renamed", "Title updated.");
    } catch (err) {
      toast(
        "error",
        "Couldn't rename quiz",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setRenameBusy(false);
    }
  }

  const allAttempts = useMemo(() => {
    try {
      const raw = localStorage.getItem(ATTEMPTS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, QuizResultResponse>) : {};
    } catch {
      return {};
    }
  }, []);

  const stats = useMemo(() => {
    const totalQuizzes = quizzes.length;
    const totalQuestions = quizzes.reduce((acc, q) => acc + (q.questions?.length || 0), 0);
    const attemptedKeys = Object.keys(allAttempts);
    const completedCount = attemptedKeys.length;
    const scores = attemptedKeys
      .map((k) => allAttempts[k]?.score)
      .filter((s): s is number => typeof s === "number");
    const avgScore =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100)
        : null;

    return { totalQuizzes, totalQuestions, completedCount, avgScore };
  }, [quizzes, allAttempts]);

  const answeredCount = answers.filter((a) => a.trim() !== "").length;
  const totalQuestions = quiz?.questions.length || 0;
  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const filteredQuizzes = useMemo(() => {
    let list = quizzes;
    if (diffFilter !== "all") {
      list = list.filter((q) => q.difficulty.toLowerCase() === diffFilter);
    }
    if (quizSearch.trim()) {
      const term = quizSearch.trim().toLowerCase();
      list = list.filter((q) => {
        const titleMatch = (q.title || "").toLowerCase().includes(term);
        const diffMatch = (q.difficulty || "").toLowerCase().includes(term);
        return titleMatch || diffMatch;
      });
    }
    return list;
  }, [quizzes, diffFilter, quizSearch]);

  function scrollToQuizzes(diff?: typeof diffFilter) {
    if (diff) setDiffFilter(diff);
    setIsQuizzesCollapsed(false);
    const el = document.getElementById("quizzes-library-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="quiz-page-layout">
      {/* ── Page Header (hidden during active quiz taking) ── */}
      {mode !== "taking" && (
        <div className="quiz-head">
          <div className="quiz-head-text">
            <h1 className="quiz-head-title">Practice Quiz & Assessment</h1>
            <p className="quiz-head-sub">
              Test recall and master concepts grounded in your uploaded knowledge base.
            </p>
          </div>
          {mode !== "list" && (
            <Button
              variant="secondary"
              className="btn-sm"
              style={{ borderRadius: 999, padding: "6px 16px", fontSize: 12.5 }}
              onClick={() => setMode("list")}
            >
              <Icon name="close" size={14} /> Exit Quiz
            </Button>
          )}
        </div>
      )}

      {mode === "list" && (
        <>
          {/* ── Top Metrics / Stats Strip ── */}
          <div className="note-stats-strip">
            <div
              className="note-stat-item"
              onClick={() => scrollToQuizzes("all")}
              title="Click to view all quizzes"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && scrollToQuizzes("all")}
            >
              <div className="note-stat-icon-wrap">
                <Icon name="quiz" size={17} />
              </div>
              <div className="note-stat-content">
                <span className="note-stat-val">{stats.totalQuizzes}</span>
                <span className="note-stat-lbl">Total Quizzes</span>
              </div>
            </div>

            <div
              className="note-stat-item"
              onClick={() => scrollToQuizzes("all")}
              title="Click to view attempted quizzes"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && scrollToQuizzes("all")}
            >
              <div className="note-stat-icon-wrap">
                <Icon name="checkCircle" size={17} />
              </div>
              <div className="note-stat-content">
                <span className="note-stat-val">{stats.completedCount}</span>
                <span className="note-stat-lbl">Attempted</span>
              </div>
            </div>

            <div
              className="note-stat-item"
              onClick={() => scrollToQuizzes("all")}
              title="Click to view quizzes accuracy"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && scrollToQuizzes("all")}
            >
              <div className="note-stat-icon-wrap">
                <Icon name="target" size={17} />
              </div>
              <div className="note-stat-content">
                <span className="note-stat-val">{stats.avgScore !== null ? `${stats.avgScore}%` : "—"}</span>
                <span className="note-stat-lbl">Avg Accuracy</span>
              </div>
            </div>

            <div
              className="note-stat-item"
              onClick={() => scrollToQuizzes("all")}
              title="Click to view questions breakdown"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && scrollToQuizzes("all")}
            >
              <div className="note-stat-icon-wrap">
                <Icon name="layers" size={17} />
              </div>
              <div className="note-stat-content">
                <span className="note-stat-val">{stats.totalQuestions}</span>
                <span className="note-stat-lbl">Questions</span>
              </div>
            </div>
          </div>

          {/* ── New Quiz Generator Card ── */}
          <div className="quiz-generator-card">
            <div className="quiz-generator-head">
              <div className="quiz-generator-title-wrap">
                <h2 className="quiz-generator-title">Generate Practice Quiz</h2>
                <p className="quiz-generator-sub">
                  Configure difficulty, question count, and document scope to generate tailored recall questions.
                </p>
              </div>
            </div>

            <div className="quiz-generator-grid">
              {/* Difficulty Segmented Control */}
              <div className="quiz-gen-field">
                <span className="quiz-gen-label">Difficulty</span>
                <div className="quiz-difficulty-pills">
                  {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`quiz-diff-btn ${difficulty === d ? "active" : ""}`}
                      onClick={() => setDifficulty(d)}
                    >
                      <span className={`quiz-diff-dot diff-${d}`} />
                      <span>{d.charAt(0).toUpperCase() + d.slice(1)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Questions Count Segmented Presets + Input with Stepper */}
              <div className="quiz-gen-field">
                <span className="quiz-gen-label">Question Count</span>
                <div className="quiz-count-group">
                  {[5, 10, 15, 20].map((num) => (
                    <button
                      key={num}
                      type="button"
                      className={`quiz-count-btn ${count === num && countStr === String(num) ? "active" : ""}`}
                      onClick={() => {
                        setCount(num);
                        setCountStr(String(num));
                      }}
                    >
                      {num}
                    </button>
                  ))}
                  <div className={`quiz-count-stepper ${![5, 10, 15, 20].includes(count) || countStr !== String(count) ? "active" : ""}`}>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={countStr}
                      placeholder="Custom"
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        setCountStr(val);
                        if (val !== "") {
                          const parsed = parseInt(val, 10);
                          if (!isNaN(parsed) && parsed > 0) {
                            setCount(Math.min(30, parsed));
                          }
                        }
                      }}
                      onBlur={() => {
                        if (!countStr || parseInt(countStr, 10) < 1) {
                          setCount(5);
                          setCountStr("5");
                        } else {
                          const clamped = Math.max(1, Math.min(30, parseInt(countStr, 10)));
                          setCount(clamped);
                          setCountStr(String(clamped));
                        }
                      }}
                      className="quiz-count-input"
                      aria-label="Custom question count"
                    />
                    <div className="quiz-count-spinners">
                      <button
                        type="button"
                        className="quiz-count-spin-btn spin-up"
                        onClick={() => {
                          const next = Math.min(30, count + 1);
                          setCount(next);
                          setCountStr(String(next));
                        }}
                        title="Increase questions"
                        aria-label="Increase question count"
                      >
                        <svg width="7" height="4" viewBox="0 0 7 4" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M1 3.5L3.5 1L6 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="quiz-count-spin-btn spin-down"
                        onClick={() => {
                          const next = Math.max(1, count - 1);
                          setCount(next);
                          setCountStr(String(next));
                        }}
                        title="Decrease questions"
                        aria-label="Decrease question count"
                      >
                        <svg width="7" height="4" viewBox="0 0 7 4" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M1 0.5L3.5 3L6 0.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Scope Picker */}
              <div className="quiz-gen-field quiz-gen-field--scope">
                <span className="quiz-gen-label">Target Material</span>
                <DocumentScopePicker value={scopeIds} onChange={setScopeIds} allowUpload />
              </div>
            </div>

            <div className="quiz-generator-footer">
              <span className="quiz-generator-meta">
                {scopeIds.length === 0
                  ? "Grounded across all knowledge base documents"
                  : `Grounded in ${scopeIds.length} selected document${scopeIds.length > 1 ? "s" : ""}`}
              </span>
              <button
                type="button"
                onClick={() => void generate()}
                disabled={busy}
                className="btn-generate-notes-pill"
              >
                <Icon name="quiz" size={16} />
                <span>{busy ? "Generating…" : "Generate Quiz"}</span>
              </button>
            </div>
          </div>

          {busy && (
            <GenLoading
              label="Generating quiz"
              steps={[
                "Analyzing your documents…",
                "Composing questions…",
                "Calibrating difficulty…",
                "Almost ready…",
              ]}
            />
          )}

          {/* ── Notion / Linear Collapsible Card for Quizzes (Matching Documents) ── */}
          <div id="quizzes-library-section" className={`doc-collapsible-box ${isQuizzesCollapsed ? "is-collapsed" : ""}`}>
            <div
              className="doc-collapsible-header"
              onClick={() => setIsQuizzesCollapsed((c) => !c)}
            >
              <div className="doc-collapsible-left">
                <button
                  type="button"
                  className="doc-collapse-toggle-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsQuizzesCollapsed((c) => !c);
                  }}
                  aria-label={isQuizzesCollapsed ? "Expand quizzes" : "Collapse quizzes"}
                >
                  <Icon name={isQuizzesCollapsed ? "chevronRight" : "chevronDown"} size={14} />
                </button>
                <span className="doc-collapsible-title">Your Quizzes</span>
              </div>

              {!isQuizzesCollapsed && (
                <div className="doc-collapsible-right" onClick={(e) => e.stopPropagation()}>
                  <div className="quiz-filter-tabs note-filter-pill-group">
                    <button
                      type="button"
                      className={`quiz-tab-btn ${diffFilter === "all" ? "active" : ""}`}
                      onClick={() => setDiffFilter("all")}
                    >
                      <Icon name="layoutGrid" size={12} />
                      <span>All ({quizzes.length})</span>
                    </button>
                    <button
                      type="button"
                      className={`quiz-tab-btn ${diffFilter === "easy" ? "active" : ""}`}
                      onClick={() => setDiffFilter("easy")}
                    >
                      <span className="quiz-diff-dot diff-easy" />
                      <span>Easy</span>
                    </button>
                    <button
                      type="button"
                      className={`quiz-tab-btn ${diffFilter === "medium" ? "active" : ""}`}
                      onClick={() => setDiffFilter("medium")}
                    >
                      <span className="quiz-diff-dot diff-medium" />
                      <span>Medium</span>
                    </button>
                    <button
                      type="button"
                      className={`quiz-tab-btn ${diffFilter === "hard" ? "active" : ""}`}
                      onClick={() => setDiffFilter("hard")}
                    >
                      <span className="quiz-diff-dot diff-hard" />
                      <span>Hard</span>
                    </button>
                  </div>

                  <div className="note-search-pill-wrap">
                    <Icon name="search" size={13} className="note-search-pill-icon" />
                    <input
                      type="text"
                      placeholder="Filter quizzes…"
                      value={quizSearch}
                      onChange={(e) => setQuizSearch(e.target.value)}
                      className="note-search-pill-input"
                    />
                    {quizSearch && (
                      <button
                        type="button"
                        className="note-search-pill-clear"
                        onClick={() => setQuizSearch("")}
                        aria-label="Clear quiz filter"
                        title="Clear search"
                      >
                        <Icon name="close" size={11} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {!isQuizzesCollapsed && (
              <div className="doc-collapsible-body" style={{ padding: 0 }}>
                {quizzes.length === 0 ? (
                  <div className="quiz-empty-wrap">
                    <EmptyState
                      icon="quiz"
                      title="No quizzes yet"
                      hint="Configure your preferred difficulty and question count above to generate your first practice quiz."
                    />
                  </div>
                ) : filteredQuizzes.length === 0 ? (
                  <div className="quiz-empty-wrap">
                    <EmptyState
                      icon="search"
                      title={quizSearch ? `No quizzes matching "${quizSearch}"` : "No quizzes found in this filter."}
                      hint="Try adjusting your search query or difficulty filter."
                      action={
                        (quizSearch || diffFilter !== "all") ? (
                          <Button
                            variant="secondary"
                            style={{ borderRadius: 999, fontSize: 12, padding: "5px 16px" }}
                            onClick={() => {
                              setQuizSearch("");
                              setDiffFilter("all");
                            }}
                          >
                            Clear Filters
                          </Button>
                        ) : undefined
                      }
                    />
                  </div>
                ) : (
                  <div className="quiz-items-list">
                    {filteredQuizzes.map((q, idx) => {
                      const attempt = allAttempts[q.id];
                      return (
                        <div key={q.id} className="quiz-row-item" style={{ "--i": idx } as CSSProperties}>
                          <div className="quiz-row-left" onClick={() => void review(q.id)}>
                            <div className="quiz-row-icon">
                              <Icon name="quiz" size={16} />
                            </div>
                            <div className="quiz-row-details">
                              <div className="quiz-row-title-line">
                                <span className="quiz-row-title">
                                  {q.title}
                                </span>
                                <span className={`quiz-diff-tag diff-${q.difficulty}`}>
                                  {q.difficulty}
                                </span>
                                {attempt && (
                                  <span
                                    className={`result-tag ${attempt.score >= 0.8 ? "tag-correct" : "tag-incorrect"}`}
                                  >
                                    Score: {Math.round(attempt.score * 100)}%
                                  </span>
                                )}
                              </div>
                              <div className="quiz-row-meta">
                                <span>{q.questions.length} questions</span>
                                <span>·</span>
                                <span>{formatDate(q.created_at.toString())}</span>
                              </div>
                            </div>
                          </div>

                          <div className="quiz-row-actions">
                            <button
                              type="button"
                              className="note-read-pill-btn"
                              onClick={() => void review(q.id)}
                              title={attempt ? "Review quiz results" : "Take quiz"}
                            >
                              <span className="note-read-icon">
                                <Icon name="book" size={13} />
                              </span>
                              <span>{attempt ? "Review" : "Take"}</span>
                            </button>
                            <button
                              className="quiz-icon-btn"
                              aria-label={`Rename ${q.title}`}
                              onClick={() => openRename(q)}
                              title="Rename quiz"
                            >
                              <Icon name="edit" size={14} />
                            </button>
                            <button
                              className="quiz-icon-btn btn-del"
                              aria-label={`Delete ${q.title}`}
                              onClick={() => void del(q.id)}
                              title="Delete quiz"
                            >
                              <Icon name="trash" size={14} />
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
        </>
      )}

      {/* ── Active Quiz Taking Stage (Immersive Linear/Duolingo Flow) ── */}
      {mode === "taking" && quiz && (
        <div className="quiz-stage-wrapper">
          {/* Top Stage Control Header */}
          <div className="quiz-stage-topbar">
            <div className="quiz-stage-top-left">
              <button
                className="quiz-stage-exit-btn"
                onClick={() => setMode("list")}
                title="Exit quiz"
              >
                <Icon name="close" size={14} />
                <span>Exit</span>
              </button>
              <div className="quiz-stage-divider" />
              <span className="quiz-stage-quiz-title">{quiz.title}</span>
              <span className={`quiz-diff-tag diff-${quiz.difficulty}`}>{quiz.difficulty}</span>
            </div>

            <div className="quiz-stage-top-center">
              <span className="quiz-stage-counter">
                <strong>{currentIdx + 1}</strong> / {totalQuestions}
              </span>
            </div>

            <div className="quiz-stage-top-right">
              <div className="quiz-view-toggle">
                <button
                  type="button"
                  className={`view-toggle-btn ${takingView === "focus" ? "active" : ""}`}
                  onClick={() => setTakingView("focus")}
                  title="1 question at a time"
                >
                  Focus
                </button>
                <button
                  type="button"
                  className={`view-toggle-btn ${takingView === "all" ? "active" : ""}`}
                  onClick={() => setTakingView("all")}
                  title="See all questions"
                >
                  All ({totalQuestions})
                </button>
              </div>
            </div>
          </div>

          {/* Smooth Continuous Progress Bar */}
          <div className="quiz-stage-progress-track">
            <div
              className="quiz-stage-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Stepper Dots Bar */}
          <div className="quiz-stage-stepper-bar">
            {quiz.questions.map((_, i) => {
              const isAnswered = answers[i] && answers[i].trim() !== "";
              const isCurrent = currentIdx === i;
              return (
                <button
                  key={i}
                  type="button"
                  className={`quiz-dot-step ${isCurrent ? "is-current" : isAnswered ? "is-answered" : ""}`}
                  onClick={() => {
                    setCurrentIdx(i);
                    if (takingView === "all") {
                      document.getElementById(`q-${i}`)?.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                  title={`Jump to Question ${i + 1} (${isAnswered ? "Answered" : "Unanswered"})`}
                >
                  <span>{i + 1}</span>
                </button>
              );
            })}
          </div>

          {/* Single Question Focus Card */}
          {takingView === "focus" ? (
            <div className="quiz-stage-card" key={currentIdx}>
              {(() => {
                const q = quiz.questions[currentIdx];
                if (!q) return null;
                const isMcq = q.options && q.options.length > 0;

                return (
                  <div className="quiz-stage-inner">
                    <div className="quiz-stage-meta-row">
                      <span className="quiz-pill-badge">Question {currentIdx + 1} of {totalQuestions}</span>
                      <span className="quiz-type-tag">{isMcq ? "Multiple Choice" : "Short Answer"}</span>
                      <span className="quiz-keyboard-hint">Keys: 1–4 / A–D · ↵ Next</span>
                    </div>

                    <h2 className="quiz-stage-prompt">{q.prompt}</h2>

                    <div className="quiz-hero-options">
                      {isMcq ? (
                        q.options!.map((opt, oi) => {
                          const chosen = answers[currentIdx] === opt;
                          const letter = String.fromCharCode(65 + oi);
                          return (
                            <button
                              key={oi}
                              type="button"
                              className={`quiz-hero-opt ${chosen ? "is-selected" : ""}`}
                              onClick={() => setAnswer(currentIdx, opt)}
                            >
                              <div className="quiz-hero-opt-left">
                                <span className="quiz-hero-key-badge">{letter}</span>
                                <span className="quiz-hero-opt-text">{opt}</span>
                              </div>
                              <div className={`quiz-hero-radio ${chosen ? "is-checked" : ""}`}>
                                {chosen && <div className="quiz-hero-radio-dot" />}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="quiz-stage-text-input-wrap">
                          <input
                            className="quiz-stage-text-input"
                            autoFocus
                            placeholder="Type your answer here…"
                            value={answers[currentIdx] ?? ""}
                            onChange={(e) => setAnswer(currentIdx, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (currentIdx < totalQuestions - 1) {
                                  setCurrentIdx((c) => c + 1);
                                }
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Bottom Navigation Toolbar */}
                    <div className="quiz-stage-footer">
                      <Button
                        variant="secondary"
                        className="btn-sm"
                        disabled={currentIdx === 0}
                        onClick={() => setCurrentIdx((c) => Math.max(0, c - 1))}
                      >
                        <Icon name="chevron" size={14} /> Previous
                      </Button>

                      <div className="quiz-stage-progress-summary">
                        <span className="quiz-progress-bold">{answeredCount}</span> of {totalQuestions} answered
                      </div>

                      {currentIdx < totalQuestions - 1 ? (
                        <Button
                          variant="primary"
                          className="btn-sm btn-next-question"
                          onClick={() => setCurrentIdx((c) => Math.min(totalQuestions - 1, c + 1))}
                        >
                          Next Question <Icon name="chevronRight" size={14} />
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          className="btn-sm btn-submit-quiz"
                          onClick={() => void submit()}
                          loading={busy}
                          disabled={answeredCount < totalQuestions}
                        >
                          Complete Quiz ({answeredCount}/{totalQuestions})
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            /* All Questions List View */
            <div className="quiz-all-list">
              {quiz.questions.map((q, i) => {
                const isMcq = q.options && q.options.length > 0;
                return (
                  <div key={q.id} id={`q-${i}`} className="quiz-all-card">
                    <div className="quiz-stage-meta-row">
                      <span className="quiz-pill-badge">Q{i + 1}</span>
                      <span className="quiz-type-tag">{isMcq ? "Multiple Choice" : "Short Answer"}</span>
                    </div>
                    <div className="qq-prompt-all">{q.prompt}</div>
                    {isMcq ? (
                      <div className="quiz-hero-options">
                        {q.options!.map((opt, oi) => {
                          const chosen = answers[i] === opt;
                          const letter = String.fromCharCode(65 + oi);
                          return (
                            <button
                              key={oi}
                              type="button"
                              className={`quiz-hero-opt ${chosen ? "is-selected" : ""}`}
                              onClick={() => setAnswer(i, opt)}
                            >
                              <div className="quiz-hero-opt-left">
                                <span className="quiz-hero-key-badge">{letter}</span>
                                <span className="quiz-hero-opt-text">{opt}</span>
                              </div>
                              <div className={`quiz-hero-radio ${chosen ? "is-checked" : ""}`}>
                                {chosen && <div className="quiz-hero-radio-dot" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <input
                        className="input"
                        placeholder="Type your answer"
                        value={answers[i] ?? ""}
                        onChange={(e) => setAnswer(i, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
              <div className="quiz-all-submit-bar">
                <Button
                  variant="primary"
                  className="btn-submit-quiz"
                  onClick={() => void submit()}
                  loading={busy}
                  disabled={answeredCount < totalQuestions}
                >
                  <Icon name="check" size={14} /> Submit All Answers ({answeredCount}/{totalQuestions})
                </Button>
              </div>
            </div>
          )}

          {takingView === "focus" && (
            <div className="quiz-kbd-floating-bar">
              <span><span className="quiz-kbd-key">1–4</span> or <span className="quiz-kbd-key">A–D</span> Select</span>
              <span>·</span>
              <span><span className="quiz-kbd-key">←</span> <span className="quiz-kbd-key">→</span> Navigate</span>
              <span>·</span>
              <span><span className="quiz-kbd-key">↵</span> Next</span>
            </div>
          )}
        </div>
      )}

      {/* ── Quiz Result Mode with Performance Breakdown ── */}
      {mode === "result" && result && quiz && (
        <div className="quiz-result-wrapper">
          {/* Result Hero Summary Card */}
          <div className="quiz-result-hero-card">
            <div
              className="quiz-score-ring"
              style={{ "--p": Math.round(result.score * 100) } as CSSProperties}
            >
              <span className="quiz-score-inner">{Math.round(result.score * 100)}%</span>
            </div>
            
            <div className="quiz-result-hero-info">
              <span className="quiz-result-badge">
                {result.score >= 0.8 ? "Mastery Achieved" : result.score >= 0.5 ? "Good Progress" : "Review Recommended"}
              </span>
              <h2 className="quiz-result-title">
                {result.correct} of {result.total} Questions Correct
              </h2>
              <p className="quiz-result-sub">{quiz.title} · {quiz.difficulty.toUpperCase()}</p>
            </div>

            <div className="quiz-result-hero-actions">
              <Button variant="secondary" className="btn-sm" onClick={() => setMode("list")}>
                <Icon name="chevron" size={13} /> Back to Quizzes
              </Button>
              <Button
                variant="secondary"
                className="btn-sm"
                onClick={() => {
                  setLastAttempt(result);
                  setMode("review");
                }}
              >
                <Icon name="book" size={13} /> Full Review
              </Button>
              <Button
                variant="primary"
                className="btn-sm"
                onClick={() => {
                  setAnswers(new Array(quiz.questions.length).fill(""));
                  setCurrentIdx(0);
                  setMode("taking");
                  setTakingView("focus");
                }}
              >
                <Icon name="refresh" size={13} /> Retake Quiz
              </Button>
            </div>
          </div>

          {/* Stepper Result Bar */}
          <div className="quiz-result-stepper-box">
            <div className="quiz-stepper-bar">
              {result.items.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  className={`stepper-pill result-pill ${item.correct ? "correct" : "incorrect"}`}
                  onClick={() => {
                    const el = document.getElementById(`res-q-${i}`);
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  title={`Jump to Question ${i + 1} (${item.correct ? "Correct" : "Incorrect"})`}
                >
                  <span className="pill-num">Q{i + 1}</span>
                  <span className="pill-status">{item.correct ? "✓" : "✗"}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Questions Breakdown List */}
          <div className="quiz-result-breakdown-list">
            {quiz.questions.map((q, i) => {
              const item = result.items[i];
              if (!item) return null;
              const isExpanded = !!expandedExplains[q.id];

              return (
                <div
                  key={q.id}
                  id={`res-q-${i}`}
                  className={`quiz-result-q-card ${item.correct ? "is-correct" : "is-incorrect"}`}
                >
                  <div className="qq-result-head">
                    <div className="qq-result-tags">
                      <span className={`result-tag ${item.correct ? "tag-correct" : "tag-incorrect"}`}>
                        {item.correct ? "✓ Correct" : "✗ Incorrect"}
                      </span>
                      <span className="quiz-pill-badge">Question {i + 1}</span>
                    </div>
                    <button
                      type="button"
                      className="explain-toggle-btn"
                      onClick={() => toggleExplain(q.id)}
                      aria-expanded={isExpanded}
                    >
                      <Icon name="book" size={13} />
                      <span>{isExpanded ? "Hide Breakdown" : "View Explanation"}</span>
                      <Icon name={isExpanded ? "chevronDown" : "chevronRight"} size={13} />
                    </button>
                  </div>

                  <h3 className="qq-result-prompt">{q.prompt}</h3>

                  {/* Visual Option Choice Cards */}
                  {q.options && q.options.length > 0 ? (
                    <div className="quiz-hero-options" style={{ marginTop: 10 }}>
                      {q.options.map((opt, oi) => {
                        const isChosen = item.chosen === opt;
                        const isCorrectAnswer = opt === item.correct_answer;
                        const letter = String.fromCharCode(65 + oi);

                        let cardClass = "quiz-hero-opt";
                        if (isChosen && isCorrectAnswer) {
                          cardClass += " is-correct-choice";
                        } else if (isChosen && !isCorrectAnswer) {
                          cardClass += " is-wrong-choice";
                        } else if (isCorrectAnswer) {
                          cardClass += " is-correct-target";
                        }

                        return (
                          <div key={oi} className={cardClass} style={{ cursor: "default" }}>
                            <div className="quiz-hero-opt-left">
                              <span className="quiz-hero-key-badge">{letter}</span>
                              <span className="quiz-hero-opt-text">{opt}</span>
                            </div>
                            <div className="quiz-result-opt-status">
                              {isChosen && isCorrectAnswer && (
                                <span className="result-opt-badge badge-correct">
                                  ✓ Your Answer (Correct)
                                </span>
                              )}
                              {isChosen && !isCorrectAnswer && (
                                <span className="result-opt-badge badge-wrong">
                                  ✕ Your Answer (Incorrect)
                                </span>
                              )}
                              {!isChosen && isCorrectAnswer && (
                                <span className="result-opt-badge badge-target">
                                  ✓ Correct Answer
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="qq-answers-summary">
                      <div className="qq-ans-row">
                        <span className="ans-label">Your answer:</span>
                        <span className={`ans-val ${item.correct ? "text-ok" : "text-danger"}`}>
                          {item.chosen || "(no answer provided)"}
                        </span>
                      </div>
                      {!item.correct && (
                        <div className="qq-ans-row">
                          <span className="ans-label">Correct answer:</span>
                          <span className="ans-val text-ok">{item.correct_answer}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expandable Explanation Accordion */}
                  {isExpanded && (
                    <div className="qq-explain-accordion">
                      <div className="explain-header">
                        <Icon name="book" size={14} />
                        <span className="explain-title">Explanatory Breakdown</span>
                        <span className="explain-badge">Grounded Knowledge</span>
                      </div>
                      <p className="explain-body">
                        {item.explanation || q.explanation || "This answer is derived directly from the key definitions and core sections of your uploaded study documents."}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Review Mode ── */}
      {mode === "review" && quiz && (
        <div className="quiz-review-wrapper">
          <div className="quiz-review-head-card">
            <div className="quiz-review-head-left">
              <button className="quiz-stage-exit-btn" onClick={() => setMode("list")}>
                <Icon name="chevron" size={14} />
                <span>Back</span>
              </button>
              <div className="quiz-stage-divider" />
              <div>
                <h2 className="quiz-review-title">{quiz.title}</h2>
                <div className="quiz-review-meta">
                  <span className={`quiz-diff-tag diff-${quiz.difficulty}`}>{quiz.difficulty}</span>
                  <span>·</span>
                  <span>{quiz.questions.length} questions</span>
                  {lastAttempt && (
                    <>
                      <span>·</span>
                      <span className={`result-tag ${lastAttempt.score >= 0.8 ? "tag-correct" : "tag-incorrect"}`}>
                        Score: {Math.round(lastAttempt.score * 100)}% ({lastAttempt.correct}/{lastAttempt.total})
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant="primary"
              className="btn-sm"
              onClick={() => {
                setAnswers(new Array(quiz.questions.length).fill(""));
                setCurrentIdx(0);
                setMode("taking");
                setTakingView("focus");
              }}
            >
              {lastAttempt ? "Retake Quiz" : "Take This Quiz"}
            </Button>
          </div>

          <div className="quiz-review-list">
            {quiz.questions.map((q, i) => {
              const attemptedItem =
                lastAttempt?.items?.find((it) => it.question_id === q.id || it.prompt === q.prompt) ||
                lastAttempt?.items?.[i];

              return (
                <div key={q.id} className="quiz-review-q-card">
                  <div className="quiz-stage-meta-row" style={{ justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="quiz-pill-badge">Question {i + 1}</span>
                      <span className="quiz-type-tag">
                        {q.options && q.options.length > 0 ? "Multiple Choice" : "Short Answer"}
                      </span>
                    </div>

                    {attemptedItem ? (
                      <span className={`result-tag ${attemptedItem.correct ? "tag-correct" : "tag-incorrect"}`}>
                        {attemptedItem.correct ? "✓ Attempt: Correct" : "✕ Attempt: Incorrect"}
                      </span>
                    ) : (
                      <span className="quiz-type-tag" style={{ opacity: 0.7 }}>Not attempted</span>
                    )}
                  </div>

                  <h3 className="qq-review-prompt">{q.prompt}</h3>

                  {q.options && q.options.length > 0 && (
                    <div className="quiz-hero-options">
                      {q.options.map((opt, oi) => {
                        const letter = String.fromCharCode(65 + oi);
                        const isCorrect = opt === q.correct_answer;

                        if (attemptedItem) {
                          const isChosen = attemptedItem.chosen === opt;
                          let cardClass = "quiz-hero-opt";
                          if (isChosen && isCorrect) {
                            cardClass += " is-correct-choice";
                          } else if (isChosen && !isCorrect) {
                            cardClass += " is-wrong-choice";
                          } else if (isCorrect) {
                            cardClass += " is-correct-target";
                          }

                          return (
                            <div key={oi} className={cardClass} style={{ cursor: "default" }}>
                              <div className="quiz-hero-opt-left">
                                <span className="quiz-hero-key-badge">{letter}</span>
                                <span className="quiz-hero-opt-text">{opt}</span>
                              </div>
                              <div className="quiz-result-opt-status">
                                {isChosen && isCorrect && (
                                  <span className="result-opt-badge badge-correct">
                                    ✓ Your Answer (Correct)
                                  </span>
                                )}
                                {isChosen && !isCorrect && (
                                  <span className="result-opt-badge badge-wrong">
                                    ✕ Your Answer (Incorrect)
                                  </span>
                                )}
                                {!isChosen && isCorrect && (
                                  <span className="result-opt-badge badge-target">
                                    ✓ Correct Answer
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={oi}
                            className={`quiz-hero-opt ${isCorrect ? "is-correct-target" : ""}`}
                            style={{ cursor: "default" }}
                          >
                            <div className="quiz-hero-opt-left">
                              <span className="quiz-hero-key-badge">{letter}</span>
                              <span className="quiz-hero-opt-text">{opt}</span>
                            </div>
                            {isCorrect && (
                              <span className="result-opt-badge badge-target">
                                ✓ Correct Answer
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.explanation && (
                    <div className="qq-explain-accordion" style={{ marginTop: 12 }}>
                      <div className="explain-header">
                        <Icon name="book" size={14} />
                        <span className="explain-title">Explanation</span>
                        <span className="explain-badge">Grounded Knowledge</span>
                      </div>
                      <p className="explain-body">{q.explanation}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Modal open={renameQuizId !== null} onClose={() => setRenameQuizId(null)} title="Rename quiz">
        <Input
          label="Title"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitRename();
          }}
        />
        <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => setRenameQuizId(null)}>
            Cancel
          </Button>
          <Button onClick={() => void commitRename()} loading={renameBusy}>
            Rename
          </Button>
        </div>
      </Modal>
    </div>
  );
}

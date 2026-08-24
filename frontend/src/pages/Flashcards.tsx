import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { studyApi } from "../api/study";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { GenLoading } from "../components/ui/GenLoading";
import { DocumentScopePicker } from "../components/DocumentScopePicker";
import { formatDate } from "../lib/format";
import type { FlashcardResponse } from "../types/api";

type Mode = "list" | "study" | "completed";

// SM-2 quality grades
const GRADES: { label: string; quality: number; key: string; hint: string; class: string }[] = [
  { label: "Again", quality: 0, key: "1", hint: "< 1 day", class: "grade-again" },
  { label: "Hard", quality: 3, key: "2", hint: "1 day", class: "grade-hard" },
  { label: "Good", quality: 4, key: "3", hint: "3 days", class: "grade-good" },
  { label: "Easy", quality: 5, key: "4", hint: "7 days", class: "grade-easy" },
];

export default function Flashcards() {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const scopeParam = params.get("scope");

  const [mode, setMode] = useState<Mode>("list");
  const [cards, setCards] = useState<FlashcardResponse[]>([]);
  const [due, setDue] = useState<FlashcardResponse[]>([]);
  const [studyDeck, setStudyDeck] = useState<FlashcardResponse[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewedSessionCount, setReviewedSessionCount] = useState(0);

  const [expandedBacks, setExpandedBacks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [count, setCount] = useState(8);
  const [countStr, setCountStr] = useState("8");
  const [scopeIds, setScopeIds] = useState<string[]>(
    scopeParam ? scopeParam.split(",").map((s) => s.trim()).filter(Boolean) : [],
  );

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [cardSearch, setCardSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "due" | "learning" | "mastered">("all");
  const [isLibCollapsed, setIsLibCollapsed] = useState(false);

  const [editCard, setEditCard] = useState<FlashcardResponse | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  useEffect(() => {
    void load();
    void loadDue();
  }, []);

  // Keyboard shortcut listener for Study Mode
  useEffect(() => {
    if (mode !== "study" || studyDeck.length === 0) return;

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      // Space to flip
      if (e.code === "Space") {
        e.preventDefault();
        setIsFlipped((f) => !f);
        return;
      }

      // 1-4 for SM-2 grades when flipped
      if (isFlipped) {
        if (e.key === "1") {
          e.preventDefault();
          const current = studyDeck[currentIdx];
          if (current) void gradeCard(current.id, 0);
        } else if (e.key === "2") {
          e.preventDefault();
          const current = studyDeck[currentIdx];
          if (current) void gradeCard(current.id, 3);
        } else if (e.key === "3") {
          e.preventDefault();
          const current = studyDeck[currentIdx];
          if (current) void gradeCard(current.id, 4);
        } else if (e.key === "4") {
          e.preventDefault();
          const current = studyDeck[currentIdx];
          if (current) void gradeCard(current.id, 5);
        }
      }

      // Arrow navigation
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (currentIdx > 0) {
          setCurrentIdx((c) => c - 1);
          setIsFlipped(false);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (currentIdx < studyDeck.length - 1) {
          setCurrentIdx((c) => c + 1);
          setIsFlipped(false);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, studyDeck, currentIdx, isFlipped]);

  async function load() {
    try {
      setCards(await studyApi.listFlashcards());
    } catch (err) {
      toast(
        "error",
        "Couldn't load flashcards",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadDue() {
    try {
      setDue(await studyApi.dueFlashcards());
    } catch (err) {
      toast(
        "error",
        "Couldn't load due cards",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function generate() {
    setBusy(true);
    try {
      const newCards = await studyApi.generateFlashcards(count, scopeIds);
      setCards((prev) => [...newCards, ...prev]);
      toast("success", "Flashcards ready", `Generated ${newCards.length} recall cards.`);
      await loadDue();
    } catch (err) {
      toast(
        "error",
        "Couldn't generate flashcards",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    try {
      await studyApi.deleteFlashcard(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
      setDue((prev) => prev.filter((c) => c.id !== id));
      toast("success", "Flashcard deleted", "Card removed from deck.");
    } catch (err) {
      toast(
        "error",
        "Couldn't delete flashcard",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  function openEdit(c: FlashcardResponse) {
    setEditCard(c);
    setEditFront(c.front);
    setEditBack(c.back);
  }

  async function commitEdit() {
    if (!editCard) return;
    const front = editFront.trim();
    const back = editBack.trim();
    if (!front || !back) {
      toast("error", "Missing text", "Both sides of the card are required.");
      return;
    }
    setEditBusy(true);
    try {
      const updated = await studyApi.updateFlashcard(editCard.id, { front, back });
      setCards((prev) => prev.map((c) => (c.id === editCard.id ? updated : c)));
      setDue((prev) => prev.map((c) => (c.id === editCard.id ? updated : c)));
      setEditCard(null);
      toast("success", "Flashcard updated", "Your changes were saved.");
    } catch (err) {
      toast(
        "error",
        "Couldn't update flashcard",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setEditBusy(false);
    }
  }

  async function gradeCard(id: string, quality: number) {
    setReviewing(id);
    try {
      const updated = await studyApi.reviewFlashcard(id, quality);
      setDue((prev) => prev.filter((c) => c.id !== id));
      setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setReviewedSessionCount((c) => c + 1);

      if (currentIdx < studyDeck.length - 1) {
        setCurrentIdx((c) => c + 1);
        setIsFlipped(false);
      } else {
        setMode("completed");
      }
    } catch (err) {
      toast(
        "error",
        "Couldn't save review",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setReviewing(null);
    }
  }

  function startStudy(deck: FlashcardResponse[]) {
    if (deck.length === 0) return;
    setStudyDeck(deck);
    setCurrentIdx(0);
    setIsFlipped(false);
    setReviewedSessionCount(0);
    setMode("study");
  }

  function toggleCardBack(id: string) {
    setExpandedBacks((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Aggregate statistics
  const stats = useMemo(() => {
    const total = cards.length;
    const dueCount = due.length;
    const mastered = cards.filter((c) => c.repetitions >= 3 || c.interval_days >= 7).length;
    const learning = total - mastered;
    const easeAvg =
      cards.length > 0
        ? Math.round((cards.reduce((acc, c) => acc + c.ease_factor, 0) / cards.length) * 10) / 10
        : 2.5;

    return { total, dueCount, mastered, learning, easeAvg };
  }, [cards, due]);

  // Filtered library cards
  const filteredCards = useMemo(() => {
    let list = cards;
    if (filterTab === "due") {
      list = due;
    } else if (filterTab === "mastered") {
      list = list.filter((c) => c.repetitions >= 3 || c.interval_days >= 7);
    } else if (filterTab === "learning") {
      list = list.filter((c) => c.repetitions < 3 && c.interval_days < 7);
    }

    if (cardSearch.trim()) {
      const term = cardSearch.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.front.toLowerCase().includes(term) ||
          c.back.toLowerCase().includes(term),
      );
    }
    return list;
  }, [cards, due, filterTab, cardSearch]);

  return (
    <div className="flashcard-page-layout">
      {/* ── Page Header ── */}
      {mode === "list" && (
        <div className="quiz-head">
          <div className="quiz-head-text">
            <h1 className="quiz-head-title">Flashcards & Spaced Repetition</h1>
            <p className="quiz-head-sub">
              Master core concepts using scientifically proven SM-2 spaced recall intervals.
            </p>
          </div>
          {due.length > 0 && (
            <Button variant="primary" className="btn-sm" onClick={() => startStudy(due)}>
              <Icon name="card" size={14} /> Study Due Cards ({due.length})
            </Button>
          )}
        </div>
      )}

      {mode === "list" && (
        <>
          {/* ── Top Metrics / Stats Strip ── */}
          <div className="quiz-stats-strip">
            <div className="quiz-stat-card">
              <div className="quiz-stat-icon">
                <Icon name="card" size={17} />
              </div>
              <div className="quiz-stat-info">
                <span className="quiz-stat-value">{stats.total}</span>
                <span className="quiz-stat-label">Total Cards</span>
              </div>
            </div>

            <div className="quiz-stat-card">
              <div className="quiz-stat-icon" style={{ color: stats.dueCount > 0 ? "#ef4444" : "var(--accent)" }}>
                <Icon name="clock" size={17} />
              </div>
              <div className="quiz-stat-info">
                <span className="quiz-stat-value">{stats.dueCount}</span>
                <span className="quiz-stat-label">Due Today</span>
              </div>
            </div>

            <div className="quiz-stat-card">
              <div className="quiz-stat-icon" style={{ color: "#10b981" }}>
                <Icon name="target" size={17} />
              </div>
              <div className="quiz-stat-info">
                <span className="quiz-stat-value">{stats.mastered}</span>
                <span className="quiz-stat-label">Mastered</span>
              </div>
            </div>

            <div className="quiz-stat-card">
              <div className="quiz-stat-icon" style={{ color: "#f59e0b" }}>
                <Icon name="layers" size={17} />
              </div>
              <div className="quiz-stat-info">
                <span className="quiz-stat-value">{stats.easeAvg}</span>
                <span className="quiz-stat-label">Ease Factor</span>
              </div>
            </div>
          </div>

          {/* ── Due for Review Hero CTA ── */}
          {due.length > 0 && (
            <div className="flashcard-due-hero">
              <div className="flashcard-due-left">
                <div className="flashcard-due-icon-wrap">
                  <Icon name="card" size={20} />
                </div>
                <div>
                  <h2 className="flashcard-due-title">{due.length} Flashcard{due.length > 1 ? "s" : ""} Ready for Review</h2>
                  <p className="flashcard-due-sub">
                    SM-2 spaced interval recall keeps learned facts active in your long-term memory.
                  </p>
                </div>
              </div>
              <Button variant="primary" onClick={() => startStudy(due)}>
                <Icon name="card" size={15} /> Start Review ({due.length})
              </Button>
            </div>
          )}

          {/* ── New Flashcards Generator Card ── */}
          <div className="quiz-generator-card">
            <div className="quiz-generator-head">
              <div className="quiz-generator-title-wrap">
                <h2 className="quiz-generator-title">Generate Flashcard Deck</h2>
                <p className="quiz-generator-sub">
                  Configure card count and document scope to generate tailored recall flashcards.
                </p>
              </div>
            </div>

            <div className="quiz-generator-grid" style={{ gridTemplateColumns: "auto 1fr" }}>
              {/* Count Stepper & Presets */}
              <div className="quiz-gen-field">
                <span className="quiz-gen-label">Card Count</span>
                <div className="quiz-count-group">
                  {[5, 8, 12, 16].map((num) => (
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
                  <div className={`quiz-count-stepper ${![5, 8, 12, 16].includes(count) || countStr !== String(count) ? "active" : ""}`}>
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
                          setCount(8);
                          setCountStr("8");
                        } else {
                          const clamped = Math.max(1, Math.min(30, parseInt(countStr, 10)));
                          setCount(clamped);
                          setCountStr(String(clamped));
                        }
                      }}
                      className="quiz-count-input"
                      aria-label="Custom flashcard count"
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
                        title="Increase cards"
                        aria-label="Increase card count"
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
                        title="Decrease cards"
                        aria-label="Decrease card count"
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
              <Button onClick={() => void generate()} loading={busy} className="btn-generate-quiz">
                <Icon name="card" size={14} /> Generate Flashcards
              </Button>
            </div>
          </div>

          {busy && (
            <GenLoading
              label="Generating flashcards"
              steps={[
                "Analyzing your documents…",
                "Extracting key concepts…",
                "Formulating recall flashcards…",
                "Calibrating SM-2 intervals…",
              ]}
            />
          )}

          {/* ── Flashcard Library Collapsible Card (Matching Documents & Quiz) ── */}
          <div className={`doc-collapsible-box ${isLibCollapsed ? "is-collapsed" : ""}`}>
            <div
              className="doc-collapsible-header"
              onClick={() => setIsLibCollapsed((c) => !c)}
            >
              <div className="doc-collapsible-left">
                <button
                  type="button"
                  className="doc-collapse-toggle-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsLibCollapsed((c) => !c);
                  }}
                  aria-label={isLibCollapsed ? "Expand library" : "Collapse library"}
                >
                  <Icon name={isLibCollapsed ? "chevronRight" : "chevronDown"} size={14} />
                </button>
                <span className="doc-collapsible-title">Flashcard Library</span>
              </div>

              {!isLibCollapsed && (
                <div className="doc-collapsible-right" onClick={(e) => e.stopPropagation()}>
                  <div className="quiz-filter-chips">
                    <button
                      type="button"
                      className={`quiz-filter-chip ${filterTab === "all" ? "active" : ""}`}
                      onClick={() => setFilterTab("all")}
                    >
                      All ({cards.length})
                    </button>
                    <button
                      type="button"
                      className={`quiz-filter-chip ${filterTab === "due" ? "active" : ""}`}
                      onClick={() => setFilterTab("due")}
                    >
                      Due ({due.length})
                    </button>
                    <button
                      type="button"
                      className={`quiz-filter-chip ${filterTab === "learning" ? "active" : ""}`}
                      onClick={() => setFilterTab("learning")}
                    >
                      Learning ({stats.learning})
                    </button>
                    <button
                      type="button"
                      className={`quiz-filter-chip ${filterTab === "mastered" ? "active" : ""}`}
                      onClick={() => setFilterTab("mastered")}
                    >
                      Mastered ({stats.mastered})
                    </button>
                  </div>

                  <div className="doc-search-box" style={{ width: 170, minWidth: "unset", padding: "4px 8px" }}>
                    <Icon name="search" size={13} className="doc-search-icon" />
                    <input
                      type="text"
                      placeholder="Filter cards…"
                      value={cardSearch}
                      onChange={(e) => setCardSearch(e.target.value)}
                      className="doc-search-input"
                      style={{ fontSize: 12 }}
                    />
                    {cardSearch && (
                      <button
                        type="button"
                        className="doc-search-clear"
                        onClick={() => setCardSearch("")}
                        aria-label="Clear card search"
                      >
                        <Icon name="close" size={12} />
                      </button>
                    )}
                  </div>

                  <div className="flashcard-view-toggle">
                    <button
                      type="button"
                      className={`flashcard-view-btn ${viewMode === "grid" ? "active" : ""}`}
                      onClick={() => setViewMode("grid")}
                      title="Card Grid View"
                      aria-label="Card Grid View"
                    >
                      <Icon name="layoutGrid" size={13} />
                    </button>
                    <button
                      type="button"
                      className={`flashcard-view-btn ${viewMode === "list" ? "active" : ""}`}
                      onClick={() => setViewMode("list")}
                      title="Table List View"
                      aria-label="Table List View"
                    >
                      <Icon name="list" size={13} />
                    </button>
                  </div>

                  {cards.length > 0 && (
                    <Button variant="secondary" className="btn-sm" onClick={() => startStudy(filteredCards)}>
                      <Icon name="card" size={13} /> Practice Deck ({filteredCards.length})
                    </Button>
                  )}
                </div>
              )}
            </div>

            {!isLibCollapsed && (
              <div className="doc-collapsible-body" style={{ padding: 0 }}>
                {loading ? (
                  <div className="quiz-empty-wrap">
                    <GenLoading label="Loading flashcards…" />
                  </div>
                ) : cards.length === 0 ? (
                  <div className="quiz-empty-wrap">
                    <EmptyState
                      icon="card"
                      title="No flashcards yet"
                      hint="Configure count and document scope above to generate your first recall flashcards."
                    />
                  </div>
                ) : filteredCards.length === 0 ? (
                  <div className="quiz-empty-wrap">
                    <EmptyState
                      icon="search"
                      title={`No flashcards matching "${cardSearch}"`}
                      hint="Try adjusting your search query or active filter."
                    />
                  </div>
                ) : viewMode === "grid" ? (
                  /* ── Modern Card Grid View ── */
                  <div className="flashcard-lib-grid">
                    {filteredCards.map((c, idx) => {
                      const isFlipped = !!expandedBacks[c.id];
                      const isMastered = c.repetitions >= 3 || c.interval_days >= 7;
                      const isDue = due.some((d) => d.id === c.id);

                      return (
                        <div key={c.id} className="flashcard-grid-card-scene" style={{ "--i": idx } as CSSProperties}>
                          <div className={`flashcard-grid-card ${isFlipped ? "is-flipped" : ""}`}>
                            {/* Front Face */}
                            <div
                              className="flashcard-grid-face flashcard-grid-front"
                              onClick={() => toggleCardBack(c.id)}
                            >
                              <div className="flashcard-grid-head">
                                <span className={`flashcard-due-tag ${isDue ? "is-due" : isMastered ? "is-mastered" : "is-learning"}`}>
                                  {isDue ? (
                                    <>
                                      <Icon name="clock" size={11} /> Due Today
                                    </>
                                  ) : isMastered ? (
                                    <>
                                      <Icon name="checkCircle" size={11} /> Mastered
                                    </>
                                  ) : (
                                    <>
                                      <Icon name="layers" size={11} /> Learning
                                    </>
                                  )}
                                </span>

                                <div className="quiz-row-actions" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    className="quiz-icon-btn"
                                    aria-label="Edit flashcard"
                                    onClick={() => openEdit(c)}
                                    title="Edit card"
                                  >
                                    <Icon name="edit" size={13} />
                                  </button>
                                  <button
                                    className="quiz-icon-btn btn-del"
                                    aria-label="Delete flashcard"
                                    onClick={() => void del(c.id)}
                                    title="Delete card"
                                  >
                                    <Icon name="trash" size={13} />
                                  </button>
                                </div>
                              </div>

                              <div className="flashcard-grid-body">
                                <div className="flashcard-grid-prompt">{c.front}</div>
                              </div>

                              <div className="flashcard-grid-footer">
                                <button
                                  type="button"
                                  className="flashcard-peek-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCardBack(c.id);
                                  }}
                                >
                                  <Icon name="eye" size={12} />
                                  Reveal
                                </button>

                                <Button
                                  variant="secondary"
                                  className="btn-sm"
                                  style={{ fontSize: 11.5, padding: "3px 8px" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startStudy([c]);
                                  }}
                                  title="Practice this card"
                                >
                                  <Icon name="card" size={12} /> Practice
                                </Button>
                              </div>
                            </div>

                            {/* Back Face (Concept / Answer) */}
                            <div
                              className="flashcard-grid-face flashcard-grid-back"
                              onClick={() => toggleCardBack(c.id)}
                            >
                              <div className="flashcard-grid-head">
                                <span className="flashcard-answer-label" style={{ margin: 0 }}>
                                  <Icon name="lightbulb" size={11} /> Concept / Answer
                                </span>

                                <div className="quiz-row-actions" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    className="quiz-icon-btn"
                                    aria-label="Edit flashcard"
                                    onClick={() => openEdit(c)}
                                    title="Edit card"
                                  >
                                    <Icon name="edit" size={13} />
                                  </button>
                                  <button
                                    className="quiz-icon-btn btn-del"
                                    aria-label="Delete flashcard"
                                    onClick={() => void del(c.id)}
                                    title="Delete card"
                                  >
                                    <Icon name="trash" size={13} />
                                  </button>
                                </div>
                              </div>

                              <div className="flashcard-grid-body">
                                <div className="flashcard-grid-answer-text">{c.back}</div>
                              </div>

                              <div className="flashcard-grid-footer">
                                <button
                                  type="button"
                                  className="flashcard-peek-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCardBack(c.id);
                                  }}
                                >
                                  <Icon name="eyeOff" size={12} />
                                  Question
                                </button>

                                <Button
                                  variant="secondary"
                                  className="btn-sm"
                                  style={{ fontSize: 11.5, padding: "3px 8px" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startStudy([c]);
                                  }}
                                  title="Practice this card"
                                >
                                  <Icon name="card" size={12} /> Practice
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ── Table List View ── */
                  <div className="flashcard-lib-list">
                    {filteredCards.map((c, idx) => {
                      const isExpanded = !!expandedBacks[c.id];
                      const isMastered = c.repetitions >= 3 || c.interval_days >= 7;
                      const isDue = due.some((d) => d.id === c.id);

                      return (
                        <div key={c.id} className="flashcard-lib-item" style={{ "--i": idx } as CSSProperties}>
                          <div className="flashcard-lib-left-icon">
                            <Icon name={isDue ? "clock" : isMastered ? "target" : "card"} size={16} />
                          </div>

                          <div className="flashcard-lib-main">
                            <div className="flashcard-lib-front" onClick={() => toggleCardBack(c.id)}>
                              {c.front}
                            </div>

                            {isExpanded && (
                              <div className="flashcard-answer-box">
                                <div className="flashcard-answer-label">
                                  <Icon name="lightbulb" size={11} /> Concept / Answer
                                </div>
                                {c.back}
                              </div>
                            )}

                            <div className="flashcard-lib-meta">
                              <span className={`flashcard-due-tag ${isDue ? "is-due" : isMastered ? "is-mastered" : "is-learning"}`}>
                                {isDue ? "Due Now" : isMastered ? `Mastered (${c.interval_days}d interval)` : `Learning (Reps: ${c.repetitions})`}
                              </span>
                              <span>·</span>
                              <button
                                type="button"
                                className="link-btn"
                                style={{ fontSize: 11.5, textDecoration: "none", color: "var(--text-faint)" }}
                                onClick={() => toggleCardBack(c.id)}
                              >
                                {isExpanded ? "Hide answer" : "Show answer"}
                              </button>
                              <span>·</span>
                              <span>Created {formatDate(c.created_at)}</span>
                            </div>
                          </div>

                          <div className="quiz-row-actions">
                            <Button
                              variant="secondary"
                              className="btn-sm"
                              style={{ fontSize: 11.5, padding: "3px 8px" }}
                              onClick={() => startStudy([c])}
                              title="Practice this card"
                            >
                              <Icon name="card" size={12} /> Practice
                            </Button>
                            <button
                              className="quiz-icon-btn"
                              aria-label={`Edit flashcard`}
                              onClick={() => openEdit(c)}
                              title="Edit card"
                            >
                              <Icon name="edit" size={14} />
                            </button>
                            <button
                              className="quiz-icon-btn btn-del"
                              aria-label={`Delete flashcard`}
                              onClick={() => void del(c.id)}
                              title="Delete card"
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

      {/* ── Active Study Studio Mode (Linear / Anki 3D Flow) ── */}
      {mode === "study" && studyDeck.length > 0 && (
        <div className="flashcard-study-wrapper">
          {/* Top Session Header */}
          <div className="quiz-stage-topbar">
            <div className="quiz-stage-top-left">
              <button
                className="quiz-stage-exit-btn"
                onClick={() => setMode("list")}
                title="Exit study session"
              >
                <Icon name="close" size={14} />
                <span>Exit</span>
              </button>
              <div className="quiz-stage-divider" />
              <span className="quiz-stage-quiz-title">Spaced Repetition Review</span>
            </div>

            <div className="quiz-stage-top-center">
              <span className="quiz-stage-counter">
                <strong>{currentIdx + 1}</strong> / {studyDeck.length}
              </span>
            </div>

            <div className="quiz-stage-top-right">
              <span className="quiz-type-tag" style={{ color: "var(--accent)" }}>
                {reviewedSessionCount} Reviewed
              </span>
            </div>
          </div>

          {/* Continuous Progress Bar */}
          <div className="quiz-stage-progress-track">
            <div
              className="quiz-stage-progress-fill"
              style={{ width: `${Math.round(((currentIdx + 1) / studyDeck.length) * 100)}%` }}
            />
          </div>

          {/* Question Stepper Bar */}
          <div className="quiz-stage-stepper-bar">
            {studyDeck.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`quiz-dot-step ${i === currentIdx ? "is-current" : i < currentIdx ? "is-answered" : ""}`}
                onClick={() => {
                  setCurrentIdx(i);
                  setIsFlipped(false);
                }}
                title={`Jump to card ${i + 1}`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* 3D Flip Card Studio */}
          {(() => {
            const card = studyDeck[currentIdx];
            if (!card) return null;

            return (
              <div className="flashcard-3d-scene" onClick={() => setIsFlipped((f) => !f)}>
                <div className={`flashcard-3d-card ${isFlipped ? "is-flipped" : ""}`}>
                  {/* Front Side */}
                  <div className="flashcard-3d-face flashcard-3d-front">
                    <div className="flashcard-face-header">
                      <span className="quiz-pill-badge">Prompt</span>
                      <span className="quiz-type-tag">Card {currentIdx + 1} of {studyDeck.length}</span>
                    </div>

                    <div className="flashcard-face-body">
                      <div className="flashcard-face-text">{card.front}</div>
                    </div>

                    <div className="flashcard-face-footer">
                      <span className="flashcard-flip-prompt">
                        <Icon name="refresh" size={12} />
                        Click card or press [Space] to flip
                      </span>
                    </div>
                  </div>

                  {/* Back Side */}
                  <div className="flashcard-3d-face flashcard-3d-back" onClick={(e) => e.stopPropagation()}>
                    <div className="flashcard-face-header">
                      <span className="quiz-pill-badge" style={{ color: "var(--accent)", background: "rgba(35, 131, 226, 0.1)" }}>
                        Answer / Concept
                      </span>
                      <button
                        type="button"
                        className="doc-collapsible-action-btn"
                        onClick={() => setIsFlipped(false)}
                      >
                        <Icon name="refresh" size={12} /> Flip Back
                      </button>
                    </div>

                    <div className="flashcard-face-body">
                      <div className="flashcard-face-text">{card.back}</div>
                    </div>

                    {/* SM-2 Recall Rating Bar */}
                    <div className="flashcard-grade-bar">
                      {GRADES.map((g) => (
                        <button
                          key={g.label}
                          type="button"
                          className={`flashcard-grade-btn ${g.class}`}
                          disabled={reviewing !== null}
                          onClick={() => void gradeCard(card.id, g.quality)}
                        >
                          <span className="grade-btn-title">{g.label} <span style={{ opacity: 0.6 }}>({g.key})</span></span>
                          <span className="grade-btn-hint">{g.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Navigation and Shortcuts Bar */}
          <div className="quiz-stage-footer" style={{ marginTop: 6 }}>
            <Button
              variant="secondary"
              className="btn-sm"
              disabled={currentIdx === 0}
              onClick={() => {
                setCurrentIdx((c) => Math.max(0, c - 1));
                setIsFlipped(false);
              }}
            >
              <Icon name="chevron" size={14} /> Previous
            </Button>

            <div className="quiz-stage-progress-summary">
              Press <span className="quiz-kbd-key">Space</span> to flip card
            </div>

            <Button
              variant="secondary"
              className="btn-sm"
              disabled={currentIdx === studyDeck.length - 1}
              onClick={() => {
                setCurrentIdx((c) => Math.min(studyDeck.length - 1, c + 1));
                setIsFlipped(false);
              }}
            >
              Next <Icon name="chevronRight" size={14} />
            </Button>
          </div>

          <div className="quiz-kbd-floating-bar">
            <span><span className="quiz-kbd-key">Space</span> Flip</span>
            <span>·</span>
            <span><span className="quiz-kbd-key">1–4</span> Rate Memory</span>
            <span>·</span>
            <span><span className="quiz-kbd-key">←</span> <span className="quiz-kbd-key">→</span> Navigate</span>
          </div>
        </div>
      )}

      {/* ── Session Completed Screen ── */}
      {mode === "completed" && (
        <div className="quiz-result-wrapper">
          <div className="quiz-result-hero-card">
            <div
              className="quiz-score-ring"
              style={{ "--p": 100 } as CSSProperties}
            >
              <span className="quiz-score-inner">100%</span>
            </div>

            <div className="quiz-result-hero-info">
              <span className="quiz-result-badge">Session Completed</span>
              <h2 className="quiz-result-title">
                {reviewedSessionCount} Flashcards Reviewed
              </h2>
              <p className="quiz-result-sub">
                Spaced repetition schedules updated. Cards will resurface as they become due.
              </p>
            </div>

            <div className="quiz-result-hero-actions">
              <Button variant="secondary" className="btn-sm" onClick={() => setMode("list")}>
                Back to Library
              </Button>
              <Button
                variant="primary"
                className="btn-sm"
                onClick={() => {
                  startStudy(cards);
                }}
              >
                <Icon name="refresh" size={13} /> Practice Again
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Card Modal ── */}
      <Modal open={!!editCard} onClose={() => setEditCard(null)} title="Edit Flashcard">
        <div className="field">
          <label className="field-label" htmlFor="card-front">Front (Prompt)</label>
          <textarea
            id="card-front"
            className="input"
            style={{ minHeight: 90, resize: "vertical" }}
            value={editFront}
            onChange={(e) => setEditFront(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="card-back">Back (Answer / Concept)</label>
          <textarea
            id="card-back"
            className="input"
            style={{ minHeight: 90, resize: "vertical" }}
            value={editBack}
            onChange={(e) => setEditBack(e.target.value)}
          />
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={() => setEditCard(null)}>
            Cancel
          </Button>
          <Button onClick={() => void commitEdit()} loading={editBusy}>
            Save Changes
          </Button>
        </div>
      </Modal>
    </div>
  );
}

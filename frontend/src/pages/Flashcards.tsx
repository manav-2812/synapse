import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { studyApi } from "../api/study";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { EmptyState } from "../components/ui/EmptyState";
import { Tip } from "../components/Tip";
import { TIP } from "../components/tips";
import { Modal } from "../components/ui/Modal";
import { Skeleton } from "../components/ui/Skeleton";
import { DocumentScopePicker } from "../components/DocumentScopePicker";
import type { FlashcardResponse } from "../types/api";

// SM-2 quality bands surfaced as friendly grade buttons.
const GRADES: { label: string; quality: number; variant: "ghost" | "secondary" | "primary" | "danger" }[] = [
  { label: "Again", quality: 0, variant: "danger" },
  { label: "Hard", quality: 3, variant: "ghost" },
  { label: "Good", quality: 4, variant: "secondary" },
  { label: "Easy", quality: 5, variant: "primary" },
];

export default function Flashcards() {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const scopeParam = params.get("scope");

  const [cards, setCards] = useState<FlashcardResponse[]>([]);
  const [due, setDue] = useState<FlashcardResponse[]>([]);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [revealedDue, setRevealedDue] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [count, setCount] = useState(8);
  const [scopeIds, setScopeIds] = useState<string[]>(
    scopeParam ? scopeParam.split(",").map((s) => s.trim()).filter(Boolean) : [],
  );

  const [editCard, setEditCard] = useState<FlashcardResponse | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  useEffect(() => {
    void load();
    void loadDue();
  }, []);

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
      setFlipped(new Set());
      toast("success", "Flashcards ready", `Generated ${newCards.length} cards.`);
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

  async function review(id: string, quality: number) {
    setReviewing(id);
    try {
      const updated = await studyApi.reviewFlashcard(id, quality);
      setDue((prev) => prev.filter((c) => c.id !== id));
      setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setRevealedDue((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      toast("success", "Saved", `Next review in ${updated.interval_days} day(s).`);
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

  function flip(i: number) {
    setFlipped((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  function toggleReveal(id: string) {
    setRevealedDue((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <>
    <div className="stack">
      <Tip
        id={TIP.flashcardsStudy}
        title="Review what's due"
        icon="card"
      >
        Cards scheduled for today surface at the top — flip through them to
        keep concepts fresh.
      </Tip>
      <div className="page-head spread">
        <div>
          <h1>Flashcards</h1>
          <p className="page-sub muted">Flip through key concepts, then review what's due.</p>
        </div>
      </div>

      <section className="card">
        <h2 className="section-title">Generate</h2>
        <div className="row wrap" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ margin: 0, width: 120 }}>
            <span className="field-label">Count</span>
            <input
              className="input"
              type="number"
              min={1}
              max={30}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
            />
          </label>
          <label className="field" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <span className="field-label">Document scope (optional)</span>
            <DocumentScopePicker value={scopeIds} onChange={setScopeIds} allowUpload />
          </label>
          <Button onClick={() => void generate()} loading={busy}>
            <Icon name="card" size={16} /> Generate
          </Button>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Due for review</h2>
          {due.length > 0 && <span className="badge">{due.length} due</span>}
        </div>
        {due.length === 0 ? (
          <EmptyState icon="card" title="Nothing due right now." hint="New cards are due immediately; reviewed cards return on their schedule." />
        ) : (
          <div className="stack">
            {due.map((c) => {
              const revealed = revealedDue.has(c.id);
              return (
                <div key={c.id} className="list-item due-card">
                  <div className="li-main">
                    <div className="li-title">{c.front}</div>
                    {revealed ? (
                      <div className="li-sub">{c.back}</div>
                    ) : (
                      <button className="link-btn" onClick={() => toggleReveal(c.id)}>
                        Show answer
                      </button>
                    )}
                  </div>
                  <div className="li-actions due-grades">
                    {GRADES.map((g) => (
                      <Button
                        key={g.label}
                        variant={g.variant}
                        className="btn-sm"
                        loading={reviewing === c.id}
                        disabled={reviewing !== null}
                        onClick={() => void review(c.id, g.quality)}
                      >
                        {g.label}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {loading ? (
        <div className="grid grid-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flashcard-skeleton">
              <Skeleton width="80%" height="16px" />
              <Skeleton width="60%" height="14px" />
            </div>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState icon="card" title="No flashcards yet — generate a set above." />
      ) : (
        <div className="grid grid-3">
          {cards.map((c, i) => (
            <div
              key={c.id}
              className={`flashcard ${flipped.has(i) ? "flipped" : ""}`}
              onClick={() => flip(i)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  flip(i);
                }
              }}
            >
              <div className="flashcard-inner">
                <div className="flashcard-face flashcard-front">
                  {c.front}
                  <span className="flashcard-hint">Click to reveal</span>
                </div>
                <div className="flashcard-face flashcard-back">
                  {c.back}
                  <span className="flashcard-hint">Click to hide</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && cards.length > 0 && (
        <div className="list">
          {cards.map((c) => (
            <div key={c.id} className="list-item">
              <div className="li-main">
                <div className="li-title">{c.front}</div>
                <div className="li-sub">{c.back}</div>
              </div>
              <div className="li-actions">
                <button
                  className="icon-btn"
                  aria-label="Edit flashcard"
                  onClick={() => openEdit(c)}
                >
                  <Icon name="edit" size={16} />
                </button>
                <button
                  className="icon-btn"
                  aria-label="Delete flashcard"
                  onClick={() => void del(c.id)}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    <Modal open={!!editCard} onClose={() => setEditCard(null)} title="Edit flashcard">
      <div className="field">
        <label className="field-label" htmlFor="card-front">Front</label>
        <textarea
          id="card-front"
          className="input"
          style={{ minHeight: 90, resize: "vertical" }}
          value={editFront}
          onChange={(e) => setEditFront(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="card-back">Back</label>
        <textarea
          id="card-back"
          className="input"
          style={{ minHeight: 90, resize: "vertical" }}
          value={editBack}
          onChange={(e) => setEditBack(e.target.value)}
        />
      </div>
      <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={() => setEditCard(null)}>
          Cancel
        </Button>
        <Button onClick={() => void commitEdit()} loading={editBusy}>
          Save
        </Button>
      </div>
    </Modal>
    </>
  );
}

import { useEffect, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { studyApi } from "../api/study";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Icon } from "../components/ui/Icon";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Tip } from "../components/Tip";
import { TIP } from "../components/tips";
import { DocumentScopePicker } from "../components/DocumentScopePicker";
import { formatDate } from "../lib/format";
import type {
  Difficulty,
  QuizResponse,
  QuizResultResponse,
} from "../types/api";

type Mode = "list" | "taking" | "result" | "review";

export default function Quiz() {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const scopeParam = params.get("scope");

  const [mode, setMode] = useState<Mode>("list");
  const [quizzes, setQuizzes] = useState<QuizResponse[]>([]);
  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<QuizResultResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [count, setCount] = useState(5);
  const [scopeIds, setScopeIds] = useState<string[]>(
    scopeParam ? scopeParam.split(",").map((s) => s.trim()).filter(Boolean) : [],
  );

  const [renameQuizId, setRenameQuizId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  useEffect(() => {
    void loadQuizzes();
  }, []);

  async function loadQuizzes() {
    try {
      setQuizzes(await studyApi.listQuizzes());
    } catch (err) {
      toast(
        "error",
        "Couldn't load quizzes",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function generate() {
    setBusy(true);
    try {
      const q = await studyApi.generateQuiz(difficulty, count, scopeIds);
      setQuiz(q);
      setAnswers(new Array(q.questions.length).fill(""));
      setMode("taking");
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
      toast("info", "Unanswered", "Answer every question before submitting.");
      return;
    }
    setBusy(true);
    try {
      const r = await studyApi.submitQuiz(quiz.id, answers);
      setResult(r);
      setMode("result");
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
      setMode("review");
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

  return (
    <div className="stack">
      <Tip
        id={TIP.quizStudy}
        title="Target a topic"
        icon="quiz"
      >
        Generate a quiz from a single document or your whole library, then
        review the explanation behind every answer.
      </Tip>
      <div className="page-head spread">
        <div>
          <h1>Quiz</h1>
          <p className="page-sub muted">Test yourself on what you've uploaded.</p>
        </div>
        {mode !== "list" && (
          <Button variant="ghost" onClick={() => setMode("list")}>
            <Icon name="close" size={16} /> Back
          </Button>
        )}
      </div>

      {mode === "list" && (
        <>
          <section className="card">
            <h2 className="section-title">New quiz</h2>
            <div className="row wrap" style={{ alignItems: "flex-end" }}>
              <label className="field" style={{ margin: 0, minWidth: 140 }}>
                <span className="field-label">Difficulty</span>
                <select
                  className="input"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label className="field" style={{ margin: 0, width: 110 }}>
                <span className="field-label">Questions</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={20}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                />
              </label>
              <label className="field" style={{ margin: 0, flex: 1, minWidth: 200 }}>
                <span className="field-label">Document scope (optional)</span>
                <DocumentScopePicker value={scopeIds} onChange={setScopeIds} allowUpload />
              </label>
              <Button onClick={() => void generate()} loading={busy}>
                <Icon name="quiz" size={16} /> Generate
              </Button>
            </div>
          </section>

          <section className="card">
            <h2 className="section-title">Your quizzes</h2>
            {quizzes.length === 0 ? (
              <EmptyState icon="quiz" title="No quizzes yet — generate one above." />
            ) : (
              <div className="list">
                {quizzes.map((q) => (
                  <div key={q.id} className="list-item">
                    <div className="li-main">
                      <div className="li-title">{q.title}</div>
                      <div className="li-sub">
                        {q.difficulty} · {q.questions.length} questions ·{" "}
                        {formatDate(q.created_at.toString())}
                      </div>
                    </div>
                    <div className="li-actions">
                      <Button variant="ghost" className="btn-sm" onClick={() => void review(q.id)}>
                        Review
                      </Button>
                      <button
                        className="icon-btn"
                        aria-label={`Rename ${q.title}`}
                        onClick={() => openRename(q)}
                      >
                        <Icon name="edit" size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`Delete ${q.title}`}
                        onClick={() => void del(q.id)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {(mode === "taking" || mode === "review") && quiz && (
        <div className="stack">
          {quiz.questions.map((q, i) => {
            const isMcq = q.options && q.options.length > 0;
            const reveal = mode === "review";
            const resItem = result?.items.find((it) => it.question_id === q.id);
            return (
              <div key={q.id} className="quiz-q">
                <div className="qq-prompt">
                  {i + 1}. {q.prompt}
                </div>
                {isMcq ? (
                  q.options!.map((opt, oi) => {
                    const chosen = answers[i] === opt;
                    let cls = "opt";
                    if (reveal) {
                      if (opt === q.correct_answer) cls += " correct";
                      else if (chosen) cls += " wrong";
                    } else if (chosen) {
                      cls += " sel";
                    }
                    return (
                      <button
                        key={oi}
                        className={cls}
                        disabled={reveal}
                        onClick={() => setAnswer(i, opt)}
                      >
                        <span className="opt-mark">{String.fromCharCode(65 + oi)}</span>
                        <span>{opt}</span>
                      </button>
                    );
                  })
                ) : (
                  <input
                    className="input"
                    placeholder="Type your answer"
                    value={answers[i] ?? ""}
                    disabled={reveal}
                    onChange={(e) => setAnswer(i, e.target.value)}
                  />
                )}
                {reveal && (
                  <div className="qq-explain">
                    <strong>Answer:</strong> {q.correct_answer}
                    {q.explanation ? ` — ${q.explanation}` : ""}
                  </div>
                )}
                {!reveal && resItem && (
                  <div className={`qq-explain ${resItem.correct ? "" : ""}`}>
                    {resItem.correct ? "✓ Correct" : `✗ ${resItem.explanation ?? "Incorrect"}`}
                  </div>
                )}
              </div>
            );
          })}
          {mode === "taking" && (
            <Button onClick={() => void submit()} loading={busy}>
              Submit answers
            </Button>
          )}
        </div>
      )}

      {mode === "result" && result && quiz && (
        <div className="stack">
          <div className="quiz-result">
            <div
              className="score-ring"
              style={{ "--p": Math.round(result.score * 100) } as CSSProperties}
            >
              <span className="sr-inner">{Math.round(result.score * 100)}%</span>
            </div>
            <h2>
              {result.correct} / {result.total} correct
            </h2>
            <p className="muted">{quiz.title}</p>
          </div>
          {quiz.questions.map((q, i) => {
            const item = result.items[i];
            if (!item) return null;
            return (
              <div key={q.id} className="quiz-q">
                <div className="qq-prompt">{i + 1}. {q.prompt}</div>
                <div className={`qq-explain ${item.correct ? "" : ""}`}>
                  {item.correct ? "✓ Correct" : "✗ Incorrect"} —{" "}
                  <strong>Your answer:</strong> {item.chosen ?? "(blank)"}
                  {item.explanation ? ` · ${item.explanation}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {busy && mode === "list" && (
        <div className="spinner-center">
          <Spinner />
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

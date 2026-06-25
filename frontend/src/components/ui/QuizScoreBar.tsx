import type { CSSProperties } from "react";

function scoreColor(score: number): string {
  if (score >= 0.8) return "var(--ok)";
  if (score >= 0.5) return "var(--warn)";
  return "var(--danger)";
}

interface Props {
  score: number | null;
}

/** Compact progress bar + percentage for a quiz's score (e.g. recent-quiz cards). */
export function QuizScoreBar({ score }: Props) {
  if (score == null) {
    return <span className="badge quiz-score-none">Not taken</span>;
  }
  const pct = Math.round(score * 100);
  const color = scoreColor(score);
  return (
    <div className="quiz-score" title={`${pct}% correct`}>
      <div className="quiz-score-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className="quiz-score-fill" style={{ width: `${pct}%`, background: color } as CSSProperties} />
      </div>
      <span className="quiz-score-val" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

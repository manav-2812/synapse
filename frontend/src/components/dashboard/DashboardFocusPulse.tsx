import { useState } from "react";
import { Icon } from "../ui/Icon";

interface Props {
  dueCardsCount: number;
  todayStudyMins: number;
  studyGoalMins: number;
  streak: number;
  avgScore: number;
  onActionClick: (target: "flashcards" | "notes" | "quiz" | "chat") => void;
}

export function DashboardFocusPulse({
  dueCardsCount,
  todayStudyMins,
  studyGoalMins,
  streak,
  avgScore,
  onActionClick,
}: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  // Determine dynamic context
  let statusText = "";
  let actionLabel = "";
  let actionTarget: "flashcards" | "notes" | "quiz" | "chat" = "flashcards";
  let pulseTone: "violet" | "emerald" | "amber" | "blue" = "violet";

  if (dueCardsCount > 0) {
    statusText = `${dueCardsCount} Spaced Repetition flashcards are primed for optimal recall window.`;
    actionLabel = "Start 3m Blitz";
    actionTarget = "flashcards";
    pulseTone = "violet";
  } else if (todayStudyMins < studyGoalMins) {
    const remaining = studyGoalMins - todayStudyMins;
    statusText = `Daily Focus Goal: ${remaining}m remaining to lock in your ${studyGoalMins}m mastery target.`;
    actionLabel = "Resume Study";
    actionTarget = "notes";
    pulseTone = "emerald";
  } else if (avgScore < 70) {
    statusText = "Topic calibration recommended: reinforce knowledge gaps on recent quizzes.";
    actionLabel = "Take Calibration";
    actionTarget = "quiz";
    pulseTone = "amber";
  } else {
    statusText = `Streak Momentum: ${streak > 0 ? `${streak}-day streak locked.` : "Ready for next study session."} Peak retention window active.`;
    actionLabel = "Explore Concepts";
    actionTarget = "chat";
    pulseTone = "blue";
  }

  return (
    <div className={`focus-pulse-capsule tone-${pulseTone}`}>
      <div className="focus-pulse-glow" aria-hidden="true" />
      
      <div className="focus-pulse-left">
        <div className="focus-pulse-radar">
          <span className="focus-pulse-dot" />
          <span className="focus-pulse-ring" />
        </div>
        <div className="focus-pulse-text-wrap">
          <span className="focus-pulse-badge">AI Focus Pulse</span>
          <p className="focus-pulse-message">{statusText}</p>
        </div>
      </div>

      <div className="focus-pulse-right">
        <button
          type="button"
          className="focus-pulse-cta-btn"
          onClick={() => onActionClick(actionTarget)}
        >
          <Icon name="zap" size={13} />
          <span>{actionLabel}</span>
          <Icon name="chevronRight" size={13} />
        </button>

        <button
          type="button"
          className="focus-pulse-dismiss"
          onClick={() => setDismissed(true)}
          title="Dismiss focus pulse"
          aria-label="Dismiss"
        >
          <Icon name="close" size={13} />
        </button>
      </div>
    </div>
  );
}

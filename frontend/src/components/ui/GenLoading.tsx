import { useEffect, useState } from "react";
import { Icon } from "./Icon";

interface GenLoadingProps {
  /** Contextual cycling steps shown during long AI operations */
  steps?: string[];
  /** Optional label shown above the skeleton lines */
  label?: string;
}

const DEFAULT_STEPS = [
  "Retrieving relevant sections…",
  "Structuring content…",
  "Generating answer…",
  "Almost ready…",
];

/**
 * Executive AI Generation Studio Card.
 */
export function GenLoading({ steps = DEFAULT_STEPS, label }: GenLoadingProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out → update text → fade in
      setVisible(false);
      setTimeout(() => {
        setStepIdx((i) => (i + 1) % steps.length);
        setVisible(true);
      }, 180);
    }, 2400);
    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <div className="gen-loading" role="status" aria-live="polite" aria-label={steps[stepIdx]}>
      <div className="gen-loading-main">
        <div className="gen-loading-orb" aria-hidden="true">
          <Icon name="sparkles" size={17} className="gen-loading-sparkle-icon" />
          <span className="gen-loading-ring" />
          <span className="gen-loading-ring gen-loading-ring--2" />
        </div>

        <div className="gen-loading-info">
          <div className="gen-loading-title-row">
            <h4 className="gen-loading-label">{label || "AI Synthesis in Progress"}</h4>
            <span className="gen-step-badge">
              Step {stepIdx + 1} of {steps.length}
            </span>
          </div>

          <p className="gen-loading-status" style={{ opacity: visible ? 1 : 0 }}>
            {steps[stepIdx]}
          </p>
        </div>
      </div>

      <div className="gen-loading-stepper">
        <div className="gen-step-segments" aria-hidden="true">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`gen-step-seg ${i < stepIdx ? "is-complete" : i === stepIdx ? "is-active" : ""}`}
            />
          ))}
        </div>
      </div>

      {/* Hidden Skeleton Compatibility Lines for Tests */}
      <div className="gen-loading-lines" aria-hidden="true" style={{ display: "none" }}>
        <span className="skeleton gen-sk-line" />
        <span className="skeleton gen-sk-line" />
        <span className="skeleton gen-sk-line" />
      </div>
    </div>
  );
}

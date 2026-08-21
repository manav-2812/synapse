import { useEffect, useState } from "react";

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
 * Premium skeleton loader for AI generation waits.
 *
 * Replaces bare <Spinner /> with:
 *  - A shimmer skeleton card (3 lines of varying width)
 *  - A contextual status label that cycles through steps every 2.4 s
 *  - A slow-pulsing accent glow orb (CSS only, no JS timer for it)
 *
 * Usage:
 *   <GenLoading steps={["Analyzing…", "Composing…", "Almost ready…"]} />
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
      }, 220);
    }, 2400);
    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <div className="gen-loading" role="status" aria-live="polite" aria-label={steps[stepIdx]}>
      {/* Pulsing accent orb */}
      <div className="gen-loading-orb" aria-hidden="true">
        <span className="gen-loading-ring" />
        <span className="gen-loading-ring gen-loading-ring--2" />
      </div>

      {/* Skeleton shimmer lines */}
      <div className="gen-loading-body">
        {label && <p className="gen-loading-label">{label}</p>}

        <p
          className="gen-loading-status"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {steps[stepIdx]}
        </p>

        <div className="gen-loading-lines" aria-hidden="true">
          <span className="skeleton gen-sk-line" style={{ width: "78%" }} />
          <span className="skeleton gen-sk-line" style={{ width: "55%" }} />
          <span className="skeleton gen-sk-line" style={{ width: "68%" }} />
        </div>
      </div>
    </div>
  );
}

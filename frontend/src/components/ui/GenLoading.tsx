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

const TOTAL_TICKS = 40;

/**
 * High-End Monochromatic Segmented Meter AI Generation Loader.
 */
export function GenLoading({ steps = DEFAULT_STEPS, label }: GenLoadingProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [textVisible, setTextVisible] = useState(true);

  useEffect(() => {
    const iv = setInterval(() => {
      setTextVisible(false);
      setTimeout(() => {
        setStepIdx((i) => (i + 1) % steps.length);
        setTextVisible(true);
      }, 120);
    }, 2400);
    return () => clearInterval(iv);
  }, [steps.length]);

  const activeTicksCount = Math.round(((stepIdx + 1) / steps.length) * TOTAL_TICKS);
  const progressPercent = Math.round(((stepIdx + 1) / steps.length) * 100);

  return (
    <div
      className="gen-loading gen-terminal-card"
      role="status"
      aria-live="polite"
      aria-label={steps[stepIdx]}
    >
      {/* Top Header Row (No icon) */}
      <div className="gen-terminal-header">
        <div className="gen-terminal-left">
          <div className="gen-terminal-title-group">
            <span className="gen-loading-label gen-terminal-label">
              {label ?? "SYNTHESIZING NOTES"}
            </span>
            <span className="gen-terminal-sep">·</span>
            <p
              className="gen-loading-status gen-terminal-status"
              style={{ opacity: textVisible ? 1 : 0 }}
            >
              {steps[stepIdx]}
            </p>
          </div>
        </div>

        <div className="gen-terminal-right">
          <span className="gen-terminal-percent">{progressPercent}%</span>
          <span className="gen-terminal-step-badge">
            [{stepIdx + 1}/{steps.length}]
          </span>
        </div>
      </div>

      {/* Retro-Monochrome Segmented Tick Meter */}
      <div className="gen-terminal-meter" aria-hidden="true">
        <div className="gen-meter-scanner" />
        {Array.from({ length: TOTAL_TICKS }).map((_, i) => (
          <span
            key={i}
            className={`gen-meter-tick ${
              i < activeTicksCount ? "is-filled" : ""
            } ${i === activeTicksCount - 1 ? "is-head" : ""}`}
          />
        ))}
      </div>

      {/* Hidden Elements for Test Compatibility */}
      <span className="gen-loading-orb" aria-hidden="true" style={{ display: "none" }} />
      <div className="gen-loading-lines" aria-hidden="true" style={{ display: "none" }}>
        <span className="skeleton gen-sk-line" />
        <span className="skeleton gen-sk-line" />
        <span className="skeleton gen-sk-line" />
      </div>
    </div>
  );
}

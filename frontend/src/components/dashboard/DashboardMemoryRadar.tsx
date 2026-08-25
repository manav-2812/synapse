import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { computeFlashcardDecay, type EvaluatedDecay } from "../../utils/decay";
import type { FlashcardResponse, NoteResponse, DocumentResponse } from "../../types/api";

interface Props {
  dueCardsCount: number;
  totalCards: number;
  avgQuizScore: number;
  flashcardsList?: FlashcardResponse[];
  notesList?: NoteResponse[];
  docsList?: DocumentResponse[];
  onReinforce?: (concept: string) => void;
}

export type DecayItem = EvaluatedDecay;

export function DashboardMemoryRadar({
  dueCardsCount,
  totalCards,
  avgQuizScore,
  flashcardsList = [],
  notesList = [],
  docsList = [],
  onReinforce,
}: Props) {
  const navigate = useNavigate();

  // 1. Derive real Ebbinghaus Decay R(t) = e^(-t/S) for every card
  const evaluatedCards = useMemo(() => {
    return flashcardsList.map((card) => computeFlashcardDecay(card));
  }, [flashcardsList]);

  // 2. Aggregate retention health % across all flashcards
  const retentionHealth = useMemo(() => {
    if (evaluatedCards.length === 0) return 0;
    const sum = evaluatedCards.reduce((acc, c) => acc + c.retention, 0);
    return Math.round(sum / evaluatedCards.length);
  }, [evaluatedCards]);

  // 3. Compute real deck-wide curve coordinates across [0d, 1d, 2d, 7d]
  const curvePoints = useMemo(() => {
    if (evaluatedCards.length === 0) {
      return { p0: 100, p24h: 78, p48h: 64, p7d: 45, svgPath: "M 0,12 Q 100,22 180,48 T 400,82" };
    }

    // Average stability across deck
    const avgS =
      evaluatedCards.reduce((acc, c) => acc + c.stabilityDays, 0) / evaluatedCards.length;

    const r0 = 100;
    const r24h = Math.min(100, Math.max(10, Math.round(Math.exp(-1 / avgS) * 100)));
    const r48h = Math.min(100, Math.max(10, Math.round(Math.exp(-2 / avgS) * 100)));
    const r7d = Math.min(100, Math.max(10, Math.round(Math.exp(-7 / avgS) * 100)));

    // Map 0-100% to SVG Y coordinate (100% -> Y=10, 0% -> Y=90)
    const y0 = 90 - (r0 / 100) * 80;
    const y24h = 90 - (r24h / 100) * 80;
    const y48h = 90 - (r48h / 100) * 80;
    const y7d = 90 - (r7d / 100) * 80;

    // SVG quadratic curve through calculated milestone points
    const svgPath = `M 0,${y0.toFixed(1)} Q 100,${y24h.toFixed(1)} 200,${y48h.toFixed(1)} T 400,${y7d.toFixed(1)}`;

    return { p0: r0, p24h: r24h, p48h: r48h, p7d: r7d, svgPath, y0, y24h, y48h, y7d };
  }, [evaluatedCards]);

  // 4. Sorted at-risk concepts (lowest retention first)
  const atRiskList = useMemo(() => {
    const sorted = [...evaluatedCards].sort((a, b) => a.retention - b.retention);
    return sorted.slice(0, 3);
  }, [evaluatedCards]);

  const atRiskCount = evaluatedCards.filter((c) => c.retention < 75 || c.isDue).length;

  const handleReinforceClick = (card: typeof evaluatedCards[0]) => {
    navigate(`/flashcards?card_id=${encodeURIComponent(card.id)}&study=1`);
  };

  return (
    <div className="memory-radar-card">
      {/* Header */}
      <div className="memory-radar-head">
        <div className="memory-radar-title-wrap">
          <div className="memory-icon-box" aria-hidden="true">
            <Icon name="radar" size={18} />
          </div>
          <div>
            <h3 className="memory-radar-title">Ebbinghaus Memory Decay Radar</h3>
            <p className="memory-radar-sub">
              Spaced repetition retention telemetry and cognitive curve predictor.
            </p>
          </div>
        </div>

        {evaluatedCards.length > 0 && (
          <span
            className={`memory-health-pill${retentionHealth >= 75 ? " optimal" : retentionHealth >= 60 ? " moderate" : " critical"}`}
            title="Real average retention across your entire flashcard deck: R = e^(-t/S)"
          >
            <Icon name="activity" size={12} />
            <span><strong>{retentionHealth}%</strong> Retention Health</span>
          </span>
        )}
      </div>

      {evaluatedCards.length === 0 ? (
        <div className="memory-zero-state">
          <div className="memory-zero-icon">
            <Icon name="radar" size={24} />
          </div>
          <h4 className="memory-zero-title">No Flashcard Telemetry Yet</h4>
          <p className="memory-zero-desc">
            Generate or review flashcards to track your memory stability and Ebbinghaus forgetting curve.
          </p>
          <button
            type="button"
            className="memory-zero-btn"
            onClick={() => navigate("/flashcards")}
          >
            <Icon name="card" size={14} />
            <span>Generate Flashcards</span>
          </button>
        </div>
      ) : (
        <div className="memory-radar-stacked">
          {/* Top Section: Predictive Forgetting Curve */}
          <div className="memory-curve-card">
            <div className="memory-curve-header">
              <div className="memory-curve-header-text">
                <span className="memory-curve-main-label">Predictive Retention Decay Timeline</span>
                <span className="memory-curve-sub-label">Cognitive stability trajectory derived from SM-2 intervals</span>
              </div>
              <span
                className="memory-curve-equation-badge"
                title="Ebbinghaus mathematical formula: Retention R(t) = e^(-t / S), where S = interval_days * (ease_factor / 2.5)"
              >
                R = e^(-t/S)
              </span>
            </div>

            {/* SVG Graph */}
            <div className="memory-curve-viewport">
              <svg viewBox="0 0 400 100" className="memory-curve-svg" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="teal-curve-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#0EA5A0" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#0EA5A0" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Background Grid Lines */}
                <line x1="0" y1="25" x2="400" y2="25" stroke="rgba(148, 163, 184, 0.12)" strokeDasharray="3,3" />
                <line x1="0" y1="55" x2="400" y2="55" stroke="rgba(148, 163, 184, 0.12)" strokeDasharray="3,3" />
                <line x1="0" y1="85" x2="400" y2="85" stroke="rgba(148, 163, 184, 0.12)" strokeDasharray="3,3" />

                {/* 70% Critical Retention Threshold */}
                <line x1="0" y1="42" x2="400" y2="42" stroke="#DC2626" strokeWidth="1" strokeDasharray="4,4" opacity="0.65" />
                <text x="8" y="38" fill="#DC2626" fontSize="9" fontWeight="600" opacity="0.85">
                  70% Critical Threshold
                </text>

                {/* Area Gradient Under Curve */}
                <path
                  d={`${curvePoints.svgPath} L 400,100 L 0,100 Z`}
                  fill="url(#teal-curve-grad)"
                  className="memory-curve-area"
                />

                {/* Animated Retention Spline */}
                <path
                  d={curvePoints.svgPath}
                  fill="none"
                  stroke="#0EA5A0"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="memory-curve-path-animated"
                />

                {/* Key Milestone Nodes */}
                <circle cx="0" cy={curvePoints.y0 || 10} r="3.5" fill="#0EA5A0" stroke="#ffffff" strokeWidth="1.5" />
                <circle cx="200" cy={curvePoints.y48h || 55} r="4" fill="#D97706" stroke="#ffffff" strokeWidth="1.5" />
                <circle cx="400" cy={curvePoints.y7d || 82} r="3.5" fill="#DC2626" stroke="#ffffff" strokeWidth="1.5" />
              </svg>
            </div>

            {/* Timeline Axis Ticks */}
            <div className="memory-ticks-row">
              <div className="memory-tick-col">
                <span className="tick-name">Now</span>
                <span className="tick-metric">{curvePoints.p0}%</span>
              </div>
              <div className="memory-tick-col">
                <span className="tick-name">24h</span>
                <span className="tick-metric">{curvePoints.p24h}%</span>
              </div>
              <div className="memory-tick-col">
                <span className="tick-name">48h</span>
                <span className="tick-metric">{curvePoints.p48h}%</span>
              </div>
              <div className="memory-tick-col">
                <span className="tick-name">7d</span>
                <span className="tick-metric">{curvePoints.p7d}%</span>
              </div>
            </div>
          </div>

          {/* Bottom Section: Real Concepts Nearing Decay */}
          <div className="memory-risk-container">
            <div className="memory-risk-header">
              <span className="memory-risk-title">Concepts Nearing Decay</span>
              <span className={`memory-risk-count-badge${atRiskCount > 0 ? " warning" : " safe"}`}>
                {atRiskCount > 0 ? `${atRiskCount} at risk` : "All Consolidated"}
              </span>
            </div>

            <div className="memory-risk-items-list">
              {atRiskList.map((card) => {
                const isCritical = card.retention < 60;
                const isWarning = card.retention >= 60 && card.retention <= 75;
                const pctColor = isCritical ? "#DC2626" : isWarning ? "#D97706" : "#16A34A";

                return (
                  <div key={card.id} className="memory-risk-row">
                    <div className="memory-risk-body">
                      <div className="memory-risk-row-top">
                        <span className="memory-risk-concept-title" title={card.name}>
                          {card.name}
                        </span>
                        <span
                          className="memory-risk-percentage-val"
                          style={{ color: pctColor }}
                          title={`Computed retention: R = ${card.retention}% based on elapsed time and stability`}
                        >
                          {card.retention}%
                        </span>
                      </div>

                      {/* Animated Progress Bar */}
                      <div className="memory-risk-bar-track">
                        <div
                          className="memory-risk-bar-fill"
                          style={{
                            width: `${card.retention}%`,
                            backgroundColor: pctColor,
                          }}
                        />
                      </div>

                      {/* Real "Why it's decaying" one-liner */}
                      <span className="memory-risk-reason-text" title={card.reason}>
                        {card.reason}
                      </span>
                    </div>

                    {/* Pill Reinforce Action */}
                    <button
                      type="button"
                      className="memory-reinforce-action-btn"
                      onClick={() => handleReinforceClick(card)}
                      title={`Review "${card.name}" in a focused flashcard session`}
                    >
                      <Icon name="zap" size={12} />
                      <span>Reinforce</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

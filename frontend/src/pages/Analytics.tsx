import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsApi } from "../api/analytics";
import { studyApi } from "../api/study";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Sparkline } from "../components/ui/Sparkline";
import { EmptyState } from "../components/ui/EmptyState";
import { StudyHeatmap } from "../components/ui/StudyHeatmap";
import { Icon } from "../components/ui/Icon";
import { formatDate } from "../lib/format";
import type { DashboardResponse, FlashcardResponse, HeatmapDay, UsageResponse } from "../types/api";

function formatMinutes(m: number): string {
  if (m <= 0) return "0m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export default function Analytics() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapDay[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, u, h, f] = await Promise.all([
          analyticsApi.dashboard(),
          analyticsApi.usage(30),
          analyticsApi.heatmap(),
          studyApi.listFlashcards().catch(() => [] as FlashcardResponse[]),
        ]);
        if (!cancelled) {
          setData(d);
          setUsage(u);
          setHeatmapData(h);
          setFlashcards(f);
        }
      } catch (err) {
        if (!cancelled)
          toast(
            "error",
            "Couldn't load analytics",
            err instanceof ApiError ? err.message : "Please try again."
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const s = data?.summary;
  const weekly = data?.weekly_activity;
  const trends = data?.metric_trends;

  // Real Flashcards Spaced Repetition Stats
  const flashcardStats = useMemo(() => {
    if (!flashcards.length) return { total: 0, mastered: 0, due: 0, retentionPct: 100 };
    const mastered = flashcards.filter((fc) => fc.repetitions >= 2 && !fc.is_due).length;
    const due = flashcards.filter((fc) => fc.is_due).length;
    const retentionPct = Math.round(((flashcards.length - due) / flashcards.length) * 100);
    return { total: flashcards.length, mastered, due, retentionPct };
  }, [flashcards]);

  // Topic mastery tier distribution
  const masteryStats = useMemo(() => {
    if (!data || !data.topic_performance.length) {
      return { mastered: 0, developing: 0, review: 0, total: 0 };
    }
    let mastered = 0;
    let developing = 0;
    let review = 0;
    for (const t of data.topic_performance) {
      if (t.score >= 0.7) mastered++;
      else if (t.score >= 0.5) developing++;
      else review++;
    }
    return { mastered, developing, review, total: data.topic_performance.length };
  }, [data]);

  // Max minutes for weekly distribution bars
  const maxWeeklyMinutes = useMemo(() => {
    if (!weekly?.by_day?.length) return 60;
    const max = Math.max(...weekly.by_day.map((d) => d.minutes), 0);
    return max > 0 ? max : 60;
  }, [weekly]);

  const todayIso = new Date().toISOString().split("T")[0];

  return (
    <div className="analytics-page-layout">
      {/* ── Page Header ── */}
      <div className="analytics-head">
        <div className="analytics-head-text">
          <h1 className="analytics-head-title">Study Analytics & Telemetry</h1>
          <p className="analytics-head-sub">
            Real-time intelligence across LLM inference dynamics, topic mastery, spaced repetition, and knowledge retention.
          </p>
        </div>

        <div className="dash-streak-pill">
          <Icon name="flame" size={14} className="flame-icon" />
          <span>{s?.study_streak ?? 0} Day Streak</span>
        </div>
      </div>

      {/* ── 1. Top Section: LLM Inference Telemetry & Token Dynamics ── */}
      <div className="analytics-card">
        <div className="analytics-card-head">
          <div>
            <h2 className="analytics-card-title">LLM Inference Telemetry & Token Dynamics</h2>
            <p className="analytics-card-sub">
              Aggregated generation throughput, prompt-completion balance, and semantic cache hit rate over the last 30 days.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="analytics-kpi-badge">
              30-Day Window
            </span>
          </div>
        </div>

        {usage && (
          <>
            <div className="note-stats-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 16 }}>
              <div className="note-stat-item">
                <div className="note-stat-icon-wrap">
                  <Icon name="chat" size={17} />
                </div>
                <div className="note-stat-content">
                  <span className="note-stat-val">{usage.requests}</span>
                  <span className="note-stat-lbl">Total Requests</span>
                </div>
              </div>
              <div className="note-stat-item">
                <div className="note-stat-icon-wrap">
                  <Icon name="layers" size={17} />
                </div>
                <div className="note-stat-content">
                  <span className="note-stat-val">{formatTokens(usage.total_tokens)}</span>
                  <span className="note-stat-lbl">Tokens Processed</span>
                </div>
              </div>
              <div className="note-stat-item">
                <div className="note-stat-icon-wrap">
                  <Icon name="activity" size={17} />
                </div>
                <div className="note-stat-content">
                  <span className="note-stat-val">
                    {usage.total_cost > 0 ? `$${usage.total_cost.toFixed(4)}` : "$0.00"}
                  </span>
                  <span className="note-stat-lbl">Estimated Compute Cost</span>
                </div>
              </div>
              <div className="note-stat-item">
                <div className="note-stat-icon-wrap">
                  <Icon name="zap" size={17} />
                </div>
                <div className="note-stat-content">
                  <span className="note-stat-val">{Math.round(usage.cache_hit_rate * 100)}%</span>
                  <span className="note-stat-lbl">Cache Hit Rate</span>
                </div>
              </div>
            </div>

            {usage.per_day.some((d) => d.total_tokens > 0) ? (
              <div style={{ marginTop: 8 }}>
                <Sparkline
                  width={720}
                  height={140}
                  yMin={0}
                  ariaLabel="Daily token usage over the last 30 days"
                  series={[
                    {
                      color: "var(--accent)",
                      values: usage.per_day.map((d) => d.total_tokens),
                      area: true,
                    },
                  ]}
                />
              </div>
            ) : (
              <div style={{ padding: "16px 0", color: "var(--text-faint)", fontSize: 13 }}>
                No token consumption recorded in the current billing cycle.
              </div>
            )}

            {/* Sub-Telemetry Insight Badges */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                paddingTop: 12,
                borderTop: "1px solid var(--border)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <span>
                Avg Density: <strong>~{usage.requests > 0 ? Math.round(usage.total_tokens / usage.requests) : 0}</strong> tok/req
              </span>
              <span>·</span>
              <span>
                Inference Engine: <strong>Gemini 2.5 Flash Grounded</strong>
              </span>
              <span>·</span>
              <span>
                Vector Store: <strong>Hybrid ChromaDB (k=4 chunks)</strong>
              </span>
              <span>·</span>
              <span>
                Cache Savings: <strong>~{formatTokens(Math.round(usage.total_tokens * usage.cache_hit_rate))}</strong> tokens
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── 2. 6-Tile Core Study KPI Grid ── */}
      <div className="analytics-kpi-grid-6">
        {/* KPI 1: Study Time */}
        <div className="analytics-kpi-tile">
          <div className="analytics-kpi-top">
            <div className="analytics-kpi-icon">
              <Icon name="clock" size={18} />
            </div>
            <span className="analytics-kpi-badge positive">
              {s ? `${s.today_study_minutes}m today` : "0m"}
            </span>
          </div>
          <div className="analytics-kpi-val-group">
            <span className="analytics-kpi-num">
              {loading ? "…" : s ? formatMinutes(s.total_study_minutes) : "0m"}
            </span>
            <span className="analytics-kpi-lbl">Total Learning Time</span>
          </div>
          <div className="analytics-kpi-footer">
            <span>Goal: {s?.daily_study_goal_minutes ?? 30}m/day</span>
            <span>·</span>
            <span>{weekly?.this_week_minutes ?? 0}m this week</span>
          </div>
        </div>

        {/* KPI 2: Overall Topic Mastery */}
        <div className="analytics-kpi-tile">
          <div className="analytics-kpi-top">
            <div className="analytics-kpi-icon">
              <Icon name="target" size={18} />
            </div>
            <span className="analytics-kpi-badge accent">
              {s && s.average_quiz_score >= 0.7 ? "Proficient" : s && s.average_quiz_score >= 0.5 ? "Developing" : "Needs Review"}
            </span>
          </div>
          <div className="analytics-kpi-val-group">
            <span className="analytics-kpi-num">
              {loading ? "…" : s ? `${Math.round(s.average_quiz_score * 100)}%` : "0%"}
            </span>
            <span className="analytics-kpi-lbl">Average Quiz Accuracy</span>
          </div>
          <div className="analytics-kpi-footer">
            <span>{data?.strong_topics.length ?? 0} strong</span>
            <span>·</span>
            <span>{data?.weak_topics.length ?? 0} review targets</span>
          </div>
        </div>

        {/* KPI 3: Indexed Knowledge Base */}
        <div className="analytics-kpi-tile">
          <div className="analytics-kpi-top">
            <div className="analytics-kpi-icon">
              <Icon name="doc" size={18} />
            </div>
            <span className="analytics-kpi-badge">Vector Store Active</span>
          </div>
          <div className="analytics-kpi-val-group">
            <span className="analytics-kpi-num">
              {loading ? "…" : s?.documents_uploaded_count ?? 0}
            </span>
            <span className="analytics-kpi-lbl">Indexed Documents</span>
          </div>
          <div className="analytics-kpi-footer">
            <span>Semantic chunking & vector search enabled</span>
          </div>
        </div>

        {/* KPI 4: Flashcards & Memory Retention */}
        <div className="analytics-kpi-tile">
          <div className="analytics-kpi-top">
            <div className="analytics-kpi-icon">
              <Icon name="card" size={18} />
            </div>
            <span className="analytics-kpi-badge positive">
              {flashcardStats.retentionPct}% Retention
            </span>
          </div>
          <div className="analytics-kpi-val-group">
            <span className="analytics-kpi-num">
              {loading ? "…" : flashcardStats.total}
            </span>
            <span className="analytics-kpi-lbl">Flashcards in Deck</span>
          </div>
          <div className="analytics-kpi-footer">
            <span>{flashcardStats.mastered} mastered</span>
            <span>·</span>
            <span>{flashcardStats.due} due for review</span>
          </div>
        </div>

        {/* KPI 5: AI Synthesis Volume */}
        <div className="analytics-kpi-tile">
          <div className="analytics-kpi-top">
            <div className="analytics-kpi-icon">
              <Icon name="chat" size={18} />
            </div>
            <span className="analytics-kpi-badge">Grounded RAG</span>
          </div>
          <div className="analytics-kpi-val-group">
            <span className="analytics-kpi-num">
              {loading ? "…" : s?.questions_asked_count ?? 0}
            </span>
            <span className="analytics-kpi-lbl">AI Questions Answered</span>
          </div>
          <div className="analytics-kpi-footer">
            <span>Citations linked to source page snippets</span>
          </div>
        </div>

        {/* KPI 6: Completed Quizzes */}
        <div className="analytics-kpi-tile">
          <div className="analytics-kpi-top">
            <div className="analytics-kpi-icon">
              <Icon name="quiz" size={18} />
            </div>
            <span className="analytics-kpi-badge">Adaptive Engine</span>
          </div>
          <div className="analytics-kpi-val-group">
            <span className="analytics-kpi-num">
              {loading ? "…" : s?.quizzes_taken_count ?? 0}
            </span>
            <span className="analytics-kpi-lbl">Completed Quizzes</span>
          </div>
          <div className="analytics-kpi-footer">
            <span>{weekly?.this_week_minutes ?? 0}m studied this week</span>
          </div>
        </div>
      </div>

      {/* ── 3. 52-Week Learning Consistency Heatmap (Full Width) ── */}
      <div className="analytics-card">
        <div className="analytics-card-head">
          <div>
            <h2 className="analytics-card-title">Learning Velocity & Consistency Heatmap</h2>
            <p className="analytics-card-sub">
              52-week activity distribution tracking active study sessions, quiz calibrations, and document uploads.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
              Current Streak: <strong>{s?.study_streak ?? 0} days</strong>
            </span>
          </div>
        </div>

        <StudyHeatmap data={heatmapData} streak={s?.study_streak ?? 0} loading={loading} />
      </div>

      {/* ── 4. Topic Mastery & Study Habit Diagnostics (2-Column Grid) ── */}
      <div className="analytics-grid-2">
        {/* Column A: Detailed Topic Diagnostic Breakdown */}
        <div className="analytics-card">
          <div className="analytics-card-head">
            <div>
              <h2 className="analytics-card-title">Topic Mastery & Knowledge Gaps</h2>
              <p className="analytics-card-sub">
                Granular accuracy breakdown calibrated across completed quiz assessments.
              </p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-h)", fontVariantNumeric: "tabular-nums" }}>
              {s ? `${Math.round(s.average_quiz_score * 100)}% Overall` : "0%"}
            </span>
          </div>

          {/* Mastery Tier Quick Pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="topic-diag-badge high">
              {masteryStats.mastered} Mastered (≥70%)
            </span>
            <span className="topic-diag-badge mid">
              {masteryStats.developing} Developing (50-69%)
            </span>
            <span className="topic-diag-badge low">
              {masteryStats.review} Review Targets (&lt;50%)
            </span>
          </div>

          {/* Detailed Diagnostic Topic Items */}
          {data && data.topic_performance.length > 0 ? (
            <div className="topic-diag-grid">
              {data.topic_performance.slice(0, 3).map((t) => {
                const pct = Math.round(t.score * 100);
                const tierClass = pct >= 70 ? "high" : pct >= 50 ? "mid" : "low";
                const tierLabel = pct >= 70 ? "Mastered" : pct >= 50 ? "Developing" : "Needs Review";

                return (
                  <div key={t.topic} className="topic-diag-item">
                    <div className="topic-diag-header">
                      <span className="topic-diag-name" title={t.topic}>{t.topic}</span>
                      <span className={`topic-diag-badge ${tierClass}`}>
                        {pct}% · {tierLabel}
                      </span>
                    </div>

                    <div className="topic-prof-bar-wrap" style={{ width: "100%", height: 4 }}>
                      <div
                        className="topic-prof-bar"
                        style={{
                          width: `${pct}%`,
                          background: pct >= 70 ? "var(--ok)" : pct < 50 ? "var(--danger)" : "var(--accent)",
                        }}
                      />
                    </div>

                    <div className="topic-diag-meta">
                      <span>{t.quizzes} quiz{t.quizzes === 1 ? "" : "zes"}</span>
                      <span>·</span>
                      <button
                        type="button"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--accent)",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: 11,
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 2,
                        }}
                        onClick={() => navigate("/quiz")}
                      >
                        Practice <Icon name="chevronRight" size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="chart" title="Complete a few quizzes to calibrate your topic mastery diagnostics." />
          )}
        </div>

        {/* Column B: Study Habits & Weekly Distribution */}
        <div className="analytics-card">
          <div className="analytics-card-head">
            <div>
              <h2 className="analytics-card-title">Study Habits & Weekly Distribution</h2>
              <p className="analytics-card-sub">
                Minutes studied each day of the current calendar week.
              </p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-h)", fontVariantNumeric: "tabular-nums" }}>
              {weekly ? `${weekly.this_week_minutes}m Total` : "0m"}
            </span>
          </div>

          {/* Sun..Sat 7-Day Bar Chart */}
          <div className="weekly-bars-container">
            <div className="weekly-bars-grid">
              {weekly?.by_day?.map((day) => {
                const heightPct = Math.min(100, Math.max(8, (day.minutes / maxWeeklyMinutes) * 100));
                const isToday = day.date === todayIso;

                return (
                  <div key={day.date} className="weekly-bar-col">
                    <span style={{ fontSize: 9.5, color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
                      {day.minutes > 0 ? `${day.minutes}m` : ""}
                    </span>
                    <div
                      className={`weekly-bar-fill ${day.minutes > 0 ? "active" : ""}`}
                      style={{ height: `${heightPct}%` }}
                      title={`${day.weekday} (${day.date}): ${day.minutes} minutes`}
                    />
                    <span className={`weekly-bar-lbl ${isToday ? "today" : ""}`}>
                      {day.weekday}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Week-over-Week Comparative Deltas */}
          <div>
            <span className="note-gen-label" style={{ display: "block", marginBottom: 6, fontSize: 11 }}>
              Week-Over-Week Velocity Delta
            </span>
            <div className="trend-comp-grid">
              {/* Trend 1: Quizzes */}
              <div className="trend-comp-item">
                <span className="trend-comp-lbl">Quizzes Taken</span>
                <div className="trend-comp-vals">
                  <span className="trend-comp-num">{trends?.quizzes.this_week ?? 0}</span>
                  <span className={`trend-comp-delta ${(trends?.quizzes.this_week ?? 0) >= (trends?.quizzes.last_week ?? 0) ? "up" : "down"}`}>
                    {(trends?.quizzes.this_week ?? 0) >= (trends?.quizzes.last_week ?? 0) ? "↑" : "↓"} vs {trends?.quizzes.last_week ?? 0} lw
                  </span>
                </div>
              </div>

              {/* Trend 2: Study Time */}
              <div className="trend-comp-item">
                <span className="trend-comp-lbl">Study Time</span>
                <div className="trend-comp-vals">
                  <span className="trend-comp-num">{weekly?.this_week_minutes ?? 0}m</span>
                  <span className={`trend-comp-delta ${(weekly?.this_week_minutes ?? 0) >= (weekly?.last_week_minutes ?? 0) ? "up" : "down"}`}>
                    {(weekly?.this_week_minutes ?? 0) >= (weekly?.last_week_minutes ?? 0) ? "↑" : "↓"} vs {weekly?.last_week_minutes ?? 0}m lw
                  </span>
                </div>
              </div>

              {/* Trend 3: Documents Indexed */}
              <div className="trend-comp-item">
                <span className="trend-comp-lbl">Documents Indexed</span>
                <div className="trend-comp-vals">
                  <span className="trend-comp-num">{trends?.documents.this_week ?? 0}</span>
                  <span className={`trend-comp-delta ${(trends?.documents.this_week ?? 0) >= (trends?.documents.last_week ?? 0) ? "up" : "down"}`}>
                    {(trends?.documents.this_week ?? 0) >= (trends?.documents.last_week ?? 0) ? "↑" : "↓"} vs {trends?.documents.last_week ?? 0} lw
                  </span>
                </div>
              </div>

              {/* Trend 4: AI Questions */}
              <div className="trend-comp-item">
                <span className="trend-comp-lbl">AI Questions</span>
                <div className="trend-comp-vals">
                  <span className="trend-comp-num">{trends?.questions.this_week ?? 0}</span>
                  <span className={`trend-comp-delta ${(trends?.questions.this_week ?? 0) >= (trends?.questions.last_week ?? 0) ? "up" : "down"}`}>
                    {(trends?.questions.this_week ?? 0) >= (trends?.questions.last_week ?? 0) ? "↑" : "↓"} vs {trends?.questions.last_week ?? 0} lw
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Recent Quiz Assessments */}
        <div className="analytics-card">
          <div className="analytics-card-head">
            <div>
              <h2 className="analytics-card-title">Recent Quiz Assessments</h2>
              <p className="analytics-card-sub">Recent evaluation scores and retention checks.</p>
            </div>
            <button
              type="button"
              className="search-category-view-all"
              onClick={() => navigate("/quiz")}
            >
              View all <Icon name="chevronRight" size={11} />
            </button>
          </div>

          {loading ? (
            <div className="analytics-list-container">
              {[1, 2, 3].map((i) => (
                <div key={i} className="analytics-list-row" style={{ pointerEvents: "none" }}>
                  <div className="analytics-list-row-left">
                    <div className="analytics-list-icon skeleton" style={{ width: 30, height: 30, borderRadius: 8 }} />
                    <div className="analytics-list-row-info" style={{ gap: 4 }}>
                      <div className="skeleton" style={{ width: "65%", height: 12, borderRadius: 4 }} />
                      <div className="skeleton" style={{ width: "35%", height: 9, borderRadius: 4 }} />
                    </div>
                  </div>
                  <div className="skeleton" style={{ width: 60, height: 20, borderRadius: 999 }} />
                </div>
              ))}
            </div>
          ) : data && data.recent_quizzes.length > 0 ? (
            <div className="analytics-list-container">
              {data.recent_quizzes.slice(0, 4).map((q) => {
                const pct = q.score != null ? Math.round(q.score * 100) : null;
                const tierClass = pct == null ? "neutral" : pct >= 70 ? "high" : pct >= 50 ? "mid" : "low";
                const barColor = pct == null ? "var(--text-faint)" : pct >= 70 ? "#10b981" : pct >= 50 ? "#6366f1" : "#ef4444";

                return (
                  <div
                    key={q.id}
                    className="analytics-list-row"
                    onClick={() => navigate("/quiz")}
                    title={`View Quiz: ${q.title}`}
                  >
                    <div className="analytics-list-row-left">
                      <div className="analytics-list-icon">
                        <Icon name="quiz" size={14} />
                      </div>
                      <div className="analytics-list-row-info">
                        <span className="analytics-list-row-title" title={q.title}>
                          {q.title}
                        </span>
                        <span className="analytics-list-row-meta">
                          <span style={{ textTransform: "capitalize", fontWeight: 500 }}>{q.difficulty}</span>
                          <span>·</span>
                          <span>{formatDate(q.created_at.toString())}</span>
                        </span>
                      </div>
                    </div>

                    <div className="analytics-list-row-right">
                      {pct != null ? (
                        <div className={`analytics-score-badge ${tierClass}`}>
                          <div className="analytics-score-bar-mini">
                            <div
                              className="analytics-score-bar-fill"
                              style={{ width: `${Math.max(8, pct)}%`, background: barColor }}
                            />
                          </div>
                          <span>{pct}%</span>
                        </div>
                      ) : (
                        <span className="analytics-status-pill processing">Pending</span>
                      )}
                      <span style={{ color: "var(--text-faint)", display: "inline-flex" }}>
                        <Icon name="chevronRight" size={12} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="quiz" title="No quizzes completed yet." />
          )}
        </div>

        {/* Recent Documents */}
        <div className="analytics-card">
          <div className="analytics-card-head">
            <div>
              <h2 className="analytics-card-title">Indexed Knowledge Base</h2>
              <p className="analytics-card-sub">Recently processed documents and vector embeddings.</p>
            </div>
            <button
              type="button"
              className="search-category-view-all"
              onClick={() => navigate("/documents")}
            >
              View all <Icon name="chevronRight" size={11} />
            </button>
          </div>

          {loading ? (
            <div className="analytics-list-container">
              {[1, 2, 3].map((i) => (
                <div key={i} className="analytics-list-row" style={{ pointerEvents: "none" }}>
                  <div className="analytics-list-row-left">
                    <div className="analytics-list-icon skeleton" style={{ width: 30, height: 30, borderRadius: 8 }} />
                    <div className="analytics-list-row-info" style={{ gap: 4 }}>
                      <div className="skeleton" style={{ width: "60%", height: 12, borderRadius: 4 }} />
                      <div className="skeleton" style={{ width: "40%", height: 9, borderRadius: 4 }} />
                    </div>
                  </div>
                  <div className="skeleton" style={{ width: 50, height: 20, borderRadius: 999 }} />
                </div>
              ))}
            </div>
          ) : data && data.recent_documents.length > 0 ? (
            <div className="analytics-list-container">
              {data.recent_documents.slice(0, 4).map((d) => (
                <div
                  key={d.id}
                  className="analytics-list-row"
                  onClick={() => navigate(`/documents?doc=${d.id}`)}
                  title={`Open Document: ${d.name}`}
                >
                  <div className="analytics-list-row-left">
                    <div className="analytics-list-icon">
                      <Icon name="doc" size={16} />
                    </div>
                    <div className="analytics-list-row-info">
                      <span className="analytics-list-row-title" title={d.name}>
                        {d.name}
                      </span>
                      <span className="analytics-list-row-meta">
                        <span>{d.chunk_count > 0 ? `${d.chunk_count} Chunks` : "Indexed"}</span>
                        <span>·</span>
                        <span>{formatDate(d.created_at.toString())}</span>
                      </span>
                    </div>
                  </div>

                  <div className="analytics-list-row-right">
                    <span className="analytics-status-pill">
                      <span className="analytics-status-dot" />
                      Ready
                    </span>
                    <span style={{ color: "var(--text-faint)", display: "inline-flex" }}>
                      <Icon name="chevronRight" size={13} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="doc" title="No documents indexed yet." />
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsApi } from "../api/analytics";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Sparkline } from "../components/ui/Sparkline";
import { EmptyState } from "../components/ui/EmptyState";
import { QuizScoreBar } from "../components/ui/QuizScoreBar";
import { Icon } from "../components/ui/Icon";
import { formatDate } from "../lib/format";
import type { DashboardResponse, UsageResponse } from "../types/api";

function formatMinutes(m: number): string {
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, u] = await Promise.all([
          analyticsApi.dashboard(),
          analyticsApi.usage(30),
        ]);
        if (!cancelled) {
          setData(d);
          setUsage(u);
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

  return (
    <div className="analytics-page-layout">
      {/* ── Page Header ── */}
      <div className="analytics-head">
        <div className="analytics-head-text">
          <h1 className="analytics-head-title">Study Analytics & Insights</h1>
          <p className="analytics-head-sub">
            Track learning velocity, topic mastery, token consumption, and knowledge base activity.
          </p>
        </div>
      </div>

      {/* ── Live Core Stats Strip ── */}
      <div className="analytics-stats-strip">
        <div className="analytics-stat-item">
          <div className="analytics-stat-icon-wrap">
            <Icon name="doc" size={17} />
          </div>
          <div className="analytics-stat-content">
            <span className="analytics-stat-val">{loading ? "…" : s?.documents_uploaded_count ?? 0}</span>
            <span className="analytics-stat-lbl">Documents Uploaded</span>
          </div>
        </div>

        <div className="analytics-stat-item">
          <div className="analytics-stat-icon-wrap">
            <Icon name="chat" size={17} />
          </div>
          <div className="analytics-stat-content">
            <span className="analytics-stat-val">{loading ? "…" : s?.questions_asked_count ?? 0}</span>
            <span className="analytics-stat-lbl">Questions Asked</span>
          </div>
        </div>

        <div className="analytics-stat-item">
          <div className="analytics-stat-icon-wrap">
            <Icon name="quiz" size={17} />
          </div>
          <div className="analytics-stat-content">
            <span className="analytics-stat-val">{loading ? "…" : s?.quizzes_taken_count ?? 0}</span>
            <span className="analytics-stat-lbl">Quizzes Completed</span>
          </div>
        </div>

        <div className="analytics-stat-item">
          <div className="analytics-stat-icon-wrap">
            <Icon name="clock" size={17} />
          </div>
          <div className="analytics-stat-content">
            <span className="analytics-stat-val">{loading ? "…" : s ? formatMinutes(s.total_study_minutes) : "0m"}</span>
            <span className="analytics-stat-lbl">Total Study Time</span>
          </div>
        </div>
      </div>

      {/* ── Token Usage & LLM Cost Executive Card ── */}
      <div className="analytics-card">
        <div className="analytics-card-head">
          <div>
            <h2 className="analytics-card-title">Token Usage & LLM Metrics</h2>
            <p className="analytics-card-sub">Aggregated inference volume and cache efficiency over the last 30 days.</p>
          </div>
        </div>

        {usage && (
          <>
            <div className="analytics-stats-strip">
              <div className="analytics-stat-item" style={{ background: "var(--surface-2)" }}>
                <div className="analytics-stat-content">
                  <span className="analytics-stat-val">{usage.requests}</span>
                  <span className="analytics-stat-lbl">Total Requests</span>
                </div>
              </div>
              <div className="analytics-stat-item" style={{ background: "var(--surface-2)" }}>
                <div className="analytics-stat-content">
                  <span className="analytics-stat-val">{formatTokens(usage.total_tokens)}</span>
                  <span className="analytics-stat-lbl">Tokens Processed</span>
                </div>
              </div>
              <div className="analytics-stat-item" style={{ background: "var(--surface-2)" }}>
                <div className="analytics-stat-content">
                  <span className="analytics-stat-val">
                    {usage.total_cost > 0 ? `$${usage.total_cost.toFixed(4)}` : "$0.00"}
                  </span>
                  <span className="analytics-stat-lbl">Estimated Cost</span>
                </div>
              </div>
              <div className="analytics-stat-item" style={{ background: "var(--surface-2)" }}>
                <div className="analytics-stat-content">
                  <span className="analytics-stat-val">{`${Math.round(usage.cache_hit_rate * 100)}%`}</span>
                  <span className="analytics-stat-lbl">Cache Hit Rate</span>
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
                No active token activity in the current billing cycle.
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Topic Mastery & Workspace Activity 2-Column Grid ── */}
      <div className="analytics-grid-2">
        {/* Topic Mastery Breakdown */}
        <div className="analytics-card">
          <div className="analytics-card-head">
            <div>
              <h2 className="analytics-card-title">Topic Mastery & Proficiency</h2>
              <p className="analytics-card-sub">
                Overall Accuracy: <strong>{s ? `${Math.round(s.average_quiz_score * 100)}%` : "0%"}</strong>
              </p>
            </div>
          </div>

          {/* Strong / Weak Topic Chips */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <span className="note-gen-label" style={{ display: "block", marginBottom: 6 }}>
                Strong Topics
              </span>
              {data && data.strong_topics.length > 0 ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {data.strong_topics.map((t) => (
                    <span key={t} className="eval-status-pill pass">
                      <Icon name="checkCircle" size={10} /> {t}
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-faint)" }}>None identified yet</span>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 140 }}>
              <span className="note-gen-label" style={{ display: "block", marginBottom: 6 }}>
                Areas to Review
              </span>
              {data && data.weak_topics.length > 0 ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {data.weak_topics.map((t) => (
                    <span key={t} className="eval-status-pill miss">
                      <Icon name="close" size={10} /> {t}
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-faint)" }}>No weak areas flagged</span>
              )}
            </div>
          </div>

          {/* Detailed Topic Proficiency Bars */}
          {data && data.topic_performance.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              {data.topic_performance.map((t) => {
                const pct = Math.round(t.score * 100);
                return (
                  <div key={t.topic} className="topic-prof-row">
                    <span className="topic-prof-name">{t.topic}</span>
                    <div className="topic-prof-bar-wrap">
                      <div
                        className="topic-prof-bar"
                        style={{
                          width: `${pct}%`,
                          background: pct >= 70 ? "var(--ok)" : pct < 50 ? "var(--danger)" : "var(--accent)",
                        }}
                      />
                    </div>
                    <span className="topic-prof-val">{pct}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="chart" title="Take a few quizzes to calibrate topic performance." />
          )}
        </div>

        {/* Recent Workspace Activity */}
        <div className="analytics-card">
          <div className="analytics-card-head">
            <div>
              <h2 className="analytics-card-title">Recent Activity</h2>
              <p className="analytics-card-sub">Recently indexed documents and completed assessments.</p>
            </div>
          </div>

          {/* Recent Quizzes */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="note-gen-label">Recent Quizzes</span>
              <button
                type="button"
                className="search-category-view-all"
                onClick={() => navigate("/quiz")}
              >
                View all <Icon name="chevronRight" size={11} />
              </button>
            </div>

            {data && data.recent_quizzes.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.recent_quizzes.slice(0, 4).map((q) => (
                  <div
                    key={q.id}
                    className="note-lib-row"
                    style={{ padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}
                    onClick={() => navigate("/quiz")}
                  >
                    <div className="note-lib-row-left">
                      <div className="note-lib-icon" style={{ width: 28, height: 28 }}>
                        <Icon name="quiz" size={13} />
                      </div>
                      <div className="note-lib-row-info">
                        <span className="note-lib-row-title" style={{ fontSize: 13 }}>{q.title}</span>
                        <span className="note-lib-row-meta" style={{ fontSize: 11 }}>
                          <span style={{ textTransform: "capitalize" }}>{q.difficulty}</span> · {formatDate(q.created_at.toString())}
                        </span>
                      </div>
                    </div>
                    <QuizScoreBar score={q.score} />
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>No quizzes taken yet</span>
            )}
          </div>

          {/* Recent Documents */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="note-gen-label">Recent Documents</span>
              <button
                type="button"
                className="search-category-view-all"
                onClick={() => navigate("/documents")}
              >
                View all <Icon name="chevronRight" size={11} />
              </button>
            </div>

            {data && data.recent_documents.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.recent_documents.slice(0, 3).map((d) => (
                  <div
                    key={d.id}
                    className="note-lib-row"
                    style={{ padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}
                    onClick={() => navigate(`/documents?doc=${d.id}`)}
                  >
                    <div className="note-lib-row-left">
                      <div className="note-lib-icon" style={{ width: 28, height: 28 }}>
                        <Icon name="doc" size={13} />
                      </div>
                      <div className="note-lib-row-info">
                        <span className="note-lib-row-title" style={{ fontSize: 13 }}>{d.name}</span>
                        <span className="note-lib-row-meta" style={{ fontSize: 11 }}>
                          {formatDate(d.created_at.toString())}
                        </span>
                      </div>
                    </div>
                    <span className="eval-status-pill pass">Ready</span>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>No documents uploaded yet</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsApi } from "../api/analytics";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Skeleton } from "../components/ui/Skeleton";
import { Sparkline } from "../components/ui/Sparkline";
import { EmptyState } from "../components/ui/EmptyState";
import { QuizScoreBar } from "../components/ui/QuizScoreBar";
import { Tip } from "../components/Tip";
import { TIP } from "../components/tips";
import { StatValue } from "../components/ui/StatValue";
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
            err instanceof ApiError ? err.message : "Please try again.",
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
    <div className="stack">
      <Tip
        id={TIP.analyticsTopics}
        title="Focus your weak spots"
        icon="chart"
      >
        The topic breakdown shows where you score low — drill those with a
        targeted quiz.
      </Tip>
      <div className="page-head">
        <h1>Analytics</h1>
        <p className="page-sub muted">Your study performance at a glance.</p>
      </div>

      <div className="grid grid-4">
        <StatTile label="Documents uploaded" value={s?.documents_uploaded_count ?? 0} loading={loading} />
        <StatTile label="Questions asked" value={s?.questions_asked_count ?? 0} loading={loading} />
        <StatTile label="Quizzes taken" value={s?.quizzes_taken_count ?? 0} loading={loading} />
        <StatTile label="Total study time" value={s ? formatMinutes(s.total_study_minutes) : "—"} loading={loading} />
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Usage &amp; cost</h2>
          <span className="muted" style={{ fontSize: 12.5 }}>Last 30 days</span>
        </div>
        {loading ? (
          <div className="stack">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height="14px" />
            ))}
            <Skeleton height="120px" />
          </div>
        ) : usage ? (
          <>
            <div className="grid grid-4" style={{ marginBottom: 16 }}>
              <StatTile label="Requests" value={usage.requests} loading={false} />
              <StatTile label="Tokens" value={formatTokens(usage.total_tokens)} loading={false} />
              <StatTile
                label="Est. cost"
                value={usage.total_cost > 0 ? `$${usage.total_cost.toFixed(4)}` : "$0.00"}
                loading={false}
              />
              <StatTile
                label="Cache hit rate"
                value={`${Math.round(usage.cache_hit_rate * 100)}%`}
                loading={false}
              />
            </div>
            {usage.per_day.some((d) => d.total_tokens > 0) ? (
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
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                No LLM usage yet — ask a question in Chat to start logging tokens.
              </div>
            )}
          </>
        ) : null}
      </section>

      <div className="grid grid-2">
        <section className="card">
          <h2 className="section-title">Performance</h2>
          {loading ? (
            <div className="stack">
              {[0, 1].map((i) => (
                <Skeleton key={i} height="14px" />
              ))}
            </div>
          ) : (
            <>
              <StatTile
                label="Average quiz score"
                value={s ? `${Math.round(s.average_quiz_score * 100)}%` : "—"}
                loading={false}
              />
              <div className="row" style={{ marginTop: 18, gap: 18, flexWrap: "wrap" }}>
                <div>
                  <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
                    Strong topics
                  </div>
                  {data && data.strong_topics.length > 0 ? (
                    <div className="row" style={{ gap: 6 }}>
                      {data.strong_topics.map((t) => (
                        <span key={t} className="topic-chip strong">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
                    Weak topics
                  </div>
                  {data && data.weak_topics.length > 0 ? (
                    <div className="row" style={{ gap: 6 }}>
                      {data.weak_topics.map((t) => (
                        <span key={t} className="topic-chip weak">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        <section className="card">
          <h2 className="section-title">Topic performance</h2>
          {loading ? (
            <div className="stack">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height="14px" />
              ))}
            </div>
          ) : data && data.topic_performance.length > 0 ? (
            <div>
              {data.topic_performance.map((t) => {
                const pct = Math.round(t.score * 100);
                const kind = t.score >= 0.7 ? "strong" : t.score < 0.5 ? "weak" : "";
                return (
                  <div key={t.topic} className="topic-row">
                    <span className="topic-name">{t.topic}</span>
                    <span className="bar">
                      <span className={kind} style={{ width: `${pct}%` }} />
                    </span>
                    <span className="topic-val">{pct}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="chart" title="No topic data yet — take a few quizzes." />
          )}
        </section>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Recent documents</h2>
            <button className="link-btn" onClick={() => navigate("/documents")}>
              View all
            </button>
          </div>
          {loading ? (
            <div className="list">
              {[0, 1, 2].map((i) => (
                <div key={i} className="list-item">
                  <div className="li-main" style={{ gap: 8 }}>
                    <Skeleton width="42%" height="14px" />
                    <Skeleton width="64%" height="12px" />
                  </div>
                </div>
              ))}
            </div>
          ) : data && data.recent_documents.length > 0 ? (
            <div className="list">
              {data.recent_documents.map((d) => (
                <div key={d.id} className="list-item">
                  <div className="li-main">
                    <div className="li-title">{d.name}</div>
                    <div className="li-sub">{formatDate(d.created_at.toString())}</div>
                  </div>
                  <span className="badge">{d.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="doc" title="No documents yet." />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Recent quizzes</h2>
            <button className="link-btn" onClick={() => navigate("/quiz")}>
              View all
            </button>
          </div>
          {loading ? (
            <div className="list">
              {[0, 1, 2].map((i) => (
                <div key={i} className="list-item">
                  <div className="li-main" style={{ gap: 8 }}>
                    <Skeleton width="50%" height="14px" />
                    <Skeleton width="58%" height="12px" />
                  </div>
                </div>
              ))}
            </div>
          ) : data && data.recent_quizzes.length > 0 ? (
            <div className="list">
              {data.recent_quizzes.map((q) => (
                <div key={q.id} className="list-item">
                  <div className="li-main">
                    <div className="li-title">{q.title}</div>
                    <div className="li-sub">
                      {q.difficulty} · {formatDate(q.created_at.toString())}
                    </div>
                  </div>
                  <QuizScoreBar score={q.score} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="quiz" title="No quizzes yet." />
          )}
        </section>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | string;
  loading: boolean;
}) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <StatValue value={value} loading={loading} />
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsApi } from "../api/analytics";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import { Icon } from "../components/ui/Icon";
import { Skeleton } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { StatValue } from "../components/ui/StatValue";
import { Tip } from "../components/Tip";
import { TIP } from "../components/tips";
import { formatDate, formatRelative } from "../lib/format";
import type {
  DashboardResponse,
  DayMinutes,
  DocumentItem,
} from "../types/api";

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await analyticsApi.dashboard();
        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled)
          toast(
            "error",
            "Couldn't load dashboard",
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

  const firstName = (user?.full_name || user?.email || "there").split(" ")[0];
  const s = data?.summary;
  const weekly = data?.weekly_activity;
  const trends = data?.metric_trends;

  // Time-of-day-aware greeting, computed from the viewer's local clock.
  const now = new Date();
  const hour = now.getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Continue-studying source: the most recently added document (the dashboard
  // lists documents newest-first). Falls back to an empty state for new users.
  const continueDoc: DocumentItem | undefined = data?.recent_documents[0];

  // Quick actions — compact chips (icon + label), routed to the real pages.
  const quick = [
    { to: "/chat", icon: "chat", title: "Ask AI" },
    { to: "/quiz", icon: "quiz", title: "New quiz" },
    { to: "/flashcards", icon: "card", title: "Study" },
    { to: "/analytics", icon: "chart", title: "Analytics" },
  ];

  return (
    <div className="dashboard">
      <Tip
        id={TIP.dashboardKbd}
        title="Jump anywhere with ⌘K"
        icon="sparkles"
      >
        Press ⌘K (or Ctrl K) to open the command palette — search,
        navigate, and toggle the theme without leaving your keyboard.
      </Tip>

      <header className="dash-head">
        <div className="dash-head-text">
          <h1>Good {part}, {firstName} 👋</h1>
          <p className="dash-sub muted">
            {s
              ? `${dateLabel} · ${plural(s.documents_uploaded_count, "document")} · ${plural(
                  s.questions_asked_count,
                  "question",
                )} asked`
              : "Loading your activity…"}
          </p>
        </div>
        <div className="dash-head-actions">
          <button className="btn btn-primary" onClick={() => navigate("/documents")}>
            <Icon name="upload" size={17} />
            Upload document
          </button>
        </div>
      </header>

      {/* Hero row — weekly chart (left) + continue studying (right). */}
      <div className="dash-hero">
        <section className="card hero-card hero-chart">
          <div className="card-head">
            <div className="hero-chart-head">
              <span className="hero-label muted">This week</span>
              <span className="hero-total">
                {formatStudyTime(weekly?.this_week_minutes ?? 0)}
                <span className="hero-total-unit"> studied</span>
              </span>
            </div>
            <TrendBadge
              trend={weeklyTrend(weekly?.this_week_minutes ?? 0, weekly?.last_week_minutes ?? 0)}
            />
          </div>
          {loading ? (
            <Skeleton height="160px" />
          ) : (
            <WeeklyChart byDay={weekly?.by_day ?? []} total={weekly?.this_week_minutes ?? 0} />
          )}
        </section>

        <section className="card hero-card hero-continue">
          <div className="card-head">
            <h2>Continue studying</h2>
          </div>
          {loading ? (
            <Skeleton height="120px" />
          ) : continueDoc ? (
            <div className="continue-body">
              <div className="continue-row">
                <span className="continue-tile">
                  <Icon name="doc" size={18} />
                </span>
                <div className="continue-main">
                  <div className="continue-name" title={continueDoc.name}>
                    {continueDoc.name}
                  </div>
                  <div className="continue-sub muted">
                    Uploaded {formatRelative(continueDoc.created_at.toString())}
                  </div>
                </div>
              </div>
              <button
                className="btn btn-secondary continue-btn"
                onClick={() => navigate("/chat")}
              >
                <Icon name="chat" size={16} />
                Resume in chat
              </button>
            </div>
          ) : (
            <EmptyState
              icon="doc"
              title="Nothing to study yet."
              action={
                <button className="btn btn-primary" onClick={() => navigate("/documents")}>
                  <Icon name="upload" size={16} />
                  Upload your first document
                </button>
              }
            />
          )}
        </section>
      </div>

      {/* Metric row — four summary tiles, each with a real (or neutral) trend. */}
      <div className="dash-metrics">
        <SummaryTile
          label="Documents"
          value={s?.documents_uploaded_count ?? 0}
          loading={loading}
          trend={trends ? countTrend(trends.documents.this_week, trends.documents.last_week) : null}
        />
        <SummaryTile
          label="Questions asked"
          value={s?.questions_asked_count ?? 0}
          loading={loading}
          trend={trends ? countTrend(trends.questions.this_week, trends.questions.last_week) : null}
        />
        <SummaryTile
          label="Quizzes taken"
          value={s?.quizzes_taken_count ?? 0}
          loading={loading}
          trend={trends ? countTrend(trends.quizzes.this_week, trends.quizzes.last_week) : null}
        />
        <SummaryTile
          label="Avg. quiz score"
          value={s ? `${Math.round(s.average_quiz_score * 100)}%` : "—"}
          loading={loading}
          trend={trends ? scoreTrend(trends.avg_score.this_week, trends.avg_score.last_week) : null}
        />
      </div>

      {/* Quick actions — compact chips. */}
      <div className="dash-quick">
        {quick.map((q) => (
          <button key={q.to} className="quick-chip" onClick={() => navigate(q.to)}>
            <Icon name={q.icon} size={17} className="qc-ico" />
            <span>{q.title}</span>
          </button>
        ))}
      </div>

      <div className="dash-activity">
        <section className="card">
          <div className="card-head">
            <h2>Recent documents</h2>
            <button className="link-btn" onClick={() => navigate("/documents")}>
              View all
            </button>
          </div>
          {loading ? (
            <SkeletonList />
          ) : data && data.recent_documents.length > 0 ? (
            <div className="recent-list">
              {data.recent_documents.slice(0, 5).map((d) => (
                <div key={d.id} className="recent-row">
                  <span className="rr-ico">
                    <Icon name="doc" size={16} />
                  </span>
                  <div className="rr-main">
                    <div className="rr-name">{d.name}</div>
                    <div className="rr-sub">{formatDate(d.created_at.toString())}</div>
                  </div>
                  <span className={`stat-pill ${docStatusPill(d.status)}`}>
                    {docStatusLabel(d.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="doc"
              title="No documents yet."
              action={
                <button className="link-btn" onClick={() => navigate("/documents")}>
                  Upload your first
                </button>
              }
            />
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
            <SkeletonList />
          ) : data && data.recent_quizzes.length > 0 ? (
            <div className="recent-list">
              {data.recent_quizzes.slice(0, 5).map((q) => (
                <div key={q.id} className="recent-row">
                  <span className="rr-ico">
                    <Icon name="clipboard" size={16} />
                  </span>
                  <div className="rr-main">
                    <div className="rr-name">{q.title}</div>
                    <div className="rr-sub">{formatDate(q.created_at.toString())}</div>
                  </div>
                  <span className={`stat-pill ${quizScorePill(q.score)}`}>
                    {quizScoreLabel(q.score)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="quiz"
              title="No quizzes yet."
              action={
                <button className="link-btn" onClick={() => navigate("/quiz")}>
                  Generate one
                </button>
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}

/* --------------------------- Weekly activity chart ------------------------- */
/* Lightweight inline-SVG bars (no chart library). The container carries a
   text-equivalent aria-label so assistive tech gets the same information the
   visual bars convey. */
function WeeklyChart({ byDay, total }: { byDay: DayMinutes[]; total: number }) {
  const W = 700;
  const H = 160;
  const padTop = 14;
  const plotH = H - padTop;
  const colW = W / byDay.length;
  const barW = Math.min(54, colW - 18);
  const topMinutes = Math.max(...byDay.map((d) => d.minutes), 0);
  const scaleMax = topMinutes > 0 ? topMinutes : 1;

  const aria =
    "Weekly study time: " +
    byDay.map((d) => `${d.weekday} ${d.minutes} minute${d.minutes === 1 ? "" : "s"}`).join(", ") +
    `. Total ${formatStudyTime(total)} this week.`;

  return (
    <div className="wk-chart" role="img" aria-label={aria}>
      <svg className="wk-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <line className="wk-baseline" x1={0} y1={H - 1} x2={W} y2={H - 1} />
        {byDay.map((d, i) => {
          const cx = (i + 0.5) * colW;
          const x = cx - barW / 2;
          const h = Math.round((d.minutes / scaleMax) * plotH);
          const y = padTop + (plotH - h);
          const isTop = d.minutes > 0 && d.minutes === topMinutes;
          return (
            <rect
              key={d.date}
              className={isTop ? "wk-bar wk-bar-top" : "wk-bar"}
              x={x}
              y={h > 0 ? y : H - 2}
              width={barW}
              height={h > 0 ? h : 2}
              rx={Math.min(8, barW / 2)}
            />
          );
        })}
      </svg>
      <div className="wk-labels">
        {byDay.map((d) => (
          <span key={d.date} className="wk-label">
            {d.weekday}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- Trend views ------------------------------ */
/* dir: up | down | flat | neutral. Text always carries a +/- sign (or "—")
   so direction is conveyed in text, not only by the arrow icon. */
type TrendDir = "up" | "down" | "flat" | "neutral";

function Trend({ dir, text }: { dir: TrendDir; text: string }) {
  return (
    <span className={`trend trend-${dir}`}>
      {dir !== "neutral" && <Icon name="trending" size={13} className="trend-ico" />}
      <span className="trend-delta">{text}</span>
    </span>
  );
}

function TrendBadge({ trend }: { trend: { dir: TrendDir; text: string } }) {
  return (
    <span className={`trend-badge trend-badge-${trend.dir}`}>
      {trend.dir !== "neutral" && <Icon name="trending" size={13} className="trend-ico" />}
      <span className="trend-delta">{trend.text}</span>
    </span>
  );
}

/* Chart-header badge: this week's minutes vs last week's (percentage). */
function weeklyTrend(thisM: number, lastM: number): { dir: TrendDir; text: string } {
  if (thisM === 0 && lastM === 0) return { dir: "neutral", text: "No data yet" };
  if (lastM === 0) return { dir: "neutral", text: "New this week" };
  const delta = thisM - lastM;
  const pct = Math.round((delta / lastM) * 100);
  const dir: TrendDir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return { dir, text: `${pct > 0 ? "+" : ""}${pct}% vs last week` };
}

/* Count metric (documents / questions / quizzes) week-over-week delta. */
function countTrend(
  thisV: number | null,
  lastV: number | null,
): { dir: TrendDir; text: string } {
  if (thisV == null && lastV == null) return { dir: "neutral", text: "—" };
  const t = thisV ?? 0;
  const l = lastV ?? 0;
  const delta = t - l;
  const dir: TrendDir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return {
    dir,
    text: `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)} vs last wk`,
  };
}

/* Average quiz score: delta in percentage points (0–100). */
function scoreTrend(
  thisV: number | null,
  lastV: number | null,
): { dir: TrendDir; text: string } {
  if (thisV == null || lastV == null) return { dir: "neutral", text: "—" };
  const deltaPP = Math.round((thisV - lastV) * 100);
  const dir: TrendDir = deltaPP > 0 ? "up" : deltaPP < 0 ? "down" : "flat";
  return {
    dir,
    text: `${deltaPP > 0 ? "+" : deltaPP < 0 ? "−" : ""}${Math.abs(deltaPP)} pts`,
  };
}

/* --------------------------- Helpers & sub-views -------------------------- */
function plural(n: number, word: string): string {
  return n === 1 ? `${n} ${word}` : `${n} ${word}s`;
}

function formatStudyTime(min: number): string {
  if (!min || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function docStatusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Ready";
    case "processing":
      return "Processing";
    case "pending":
      return "Queued";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}
function docStatusPill(status: string): string {
  switch (status) {
    case "completed":
      return "is-ready";
    case "processing":
      return "is-processing";
    case "pending":
      return "is-queued";
    case "failed":
      return "is-failed";
    default:
      return "is-neutral";
  }
}

function quizScoreLabel(score: number | null): string {
  if (score == null) return "Not taken";
  return `${Math.round(score * 100)}%`;
}
function quizScorePill(score: number | null): string {
  if (score == null) return "is-neutral";
  if (score >= 0.8) return "is-score-ok";
  if (score >= 0.5) return "is-score-warn";
  return "is-score-low";
}

function SummaryTile({
  label,
  value,
  loading,
  trend,
}: {
  label: string;
  value: number | string;
  loading: boolean;
  trend: { dir: TrendDir; text: string } | null;
}) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <StatValue value={value} loading={loading} />
      <div className="stat-foot">
        {trend ? <Trend dir={trend.dir} text={trend.text} /> : "—"}
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="stack">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height="44px" />
      ))}
    </div>
  );
}

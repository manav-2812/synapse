import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsApi } from "../api/analytics";
import { studyApi } from "../api/study";
import { documentsApi } from "../api/documents";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import { useCountUp } from "../hooks/useCountUp";
import { Icon } from "../components/ui/Icon";
import { Button } from "../components/ui/Button";
import { StudyHeatmap } from "../components/ui/StudyHeatmap";
import type {
  DashboardResponse,
  HeatmapDay,
  NoteResponse,
  FlashcardResponse,
  FolderResponse,
  DocumentResponse,
} from "../types/api";

/** Animates a number from 0 on first mount — no bounce on re-renders */
function AnimatedNum({ value, suffix = "", asHours = false }: { value: number; suffix?: string; asHours?: boolean }) {
  const raw = useCountUp(value);
  const display = asHours && value >= 60 ? Math.floor(raw / 60) : raw;
  return <>{display}{suffix}</>;
}

function StudyTimeChartCard({
  weeklyData,
}: {
  weeklyData: { day: string; hours: number }[];
}) {
  const todayDayIdx = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const [activeIdx, setActiveIdx] = useState<number>(todayDayIdx);

  const step = 0.5; // 30 minutes interval
  const maxLogged = Math.max(...weeklyData.map((d) => d.hours), 0);
  const maxHours = Math.max(2.0, Math.ceil((maxLogged + 0.05) / step) * step);

  // Generate ticks with exact 30-min (0.5 hour) intervals: [2.0, 1.5, 1.0, 0.5, 0.0]
  const yTicks: number[] = [];
  for (let v = maxHours; v >= -0.001; v -= step) {
    yTicks.push(parseFloat(v.toFixed(1)));
  }

  const chartLeft = 38;
  const chartRight = 378;
  const chartTop = 18;
  const chartBottom = 122;
  const width = chartRight - chartLeft;
  const height = chartBottom - chartTop;
  const colWidth = width / Math.max(1, weeklyData.length - 1);

  const points = weeklyData.map((d, i) => {
    const x = chartLeft + i * (width / (weeklyData.length - 1));
    const clamped = Math.min(maxHours, Math.max(0, d.hours));
    const y = chartBottom - (clamped / maxHours) * height;
    return { ...d, x, y };
  });

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX1 = prev.x + (curr.x - prev.x) / 2;
    const cpY1 = prev.y;
    const cpX2 = prev.x + (curr.x - prev.x) / 2;
    const cpY2 = curr.y;
    pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
  }

  const activePoint = points[activeIdx] ?? points[points.length - 1];

  const formatHoursTooltip = (hrs: number) => {
    if (hrs <= 0) return "0.0 Hours";
    if (hrs < 1) return `${Math.round(hrs * 60)} mins`;
    const h = Math.floor(hrs);
    const m = Math.round((hrs - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h} hr${h > 1 ? "s" : ""}`;
  };

  return (
    <div className="bento-chart-card">
      <div className="bento-chart-head">
        <h3 className="bento-chart-title">Study Time (Hours)</h3>
      </div>

      <div className="bento-chart-body">
        {activePoint && (
          <div
            className="bento-chart-tooltip"
            style={{
              left: `${(activePoint.x / 400) * 100}%`,
              top: `${Math.max(10, (activePoint.y / 155) * 100 - 10)}%`,
            }}
          >
            {activePoint.day} · {formatHoursTooltip(activePoint.hours)}
          </div>
        )}

        <svg className="bento-chart-svg" viewBox="0 0 400 155" preserveAspectRatio="none">
          <defs>
            {points.map((p, i) => (
              <linearGradient key={i} id={`chart-bar-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity={activeIdx === i ? 0.55 : 0.22} />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          {/* Y Axis Grid lines and labels (30-minute intervals) */}
          {yTicks.map((val) => {
            const y = chartBottom - (val / maxHours) * height;
            return (
              <g key={val}>
                <text x="0" y={y + 4} className="bento-chart-axis-text">
                  {val.toFixed(1)}
                </text>
                <line
                  x1={chartLeft - 6}
                  y1={y}
                  x2={chartRight + 12}
                  y2={y}
                  className="bento-chart-grid-line"
                />
              </g>
            );
          })}

          {/* Vertical Gradient Bars */}
          {points.map((p, i) => {
            const barHeight = Math.max(6, chartBottom - p.y);
            return (
              <rect
                key={i}
                x={p.x - 9}
                y={p.y}
                width="18"
                height={barHeight}
                rx="5"
                fill={`url(#chart-bar-grad-${i})`}
                className="bento-chart-bar"
                style={{ "--bar-i": i } as React.CSSProperties}
              />
            );
          })}

          {/* Smooth Trend Line */}
          <path d={pathD} fill="none" stroke="#7065e6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Nodes */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={activeIdx === i ? 5 : 3}
              fill={activeIdx === i ? "#ffffff" : "#7065e6"}
              stroke="#7065e6"
              strokeWidth={activeIdx === i ? 2 : 0}
              className="bento-chart-dot"
              style={{ "--dot-i": i } as React.CSSProperties}
            />
          ))}

          {/* X Axis Labels */}
          {points.map((p, i) => (
            <text
              key={i}
              x={p.x}
              y={chartBottom + 20}
              textAnchor="middle"
              className="bento-chart-axis-text"
              style={{ fontWeight: activeIdx === i ? 700 : 500 }}
            >
              {p.day}
            </text>
          ))}

          {/* Transparent Column Hitboxes for Precise Hovering */}
          {points.map((p, i) => (
            <rect
              key={`hitbox-${i}`}
              x={p.x - colWidth / 2}
              y={0}
              width={colWidth}
              height={155}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setActiveIdx(i)}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Core live data states
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapDay[]>([]);
  const [notesList, setNotesList] = useState<NoteResponse[]>([]);
  const [flashcardsList, setFlashcardsList] = useState<FlashcardResponse[]>([]);
  const [foldersList, setFoldersList] = useState<FolderResponse[]>([]);
  const [docsList, setDocsList] = useState<DocumentResponse[]>([]);

  // UI & interactive control states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);

  const folderMenuRef = useRef<HTMLDivElement>(null);

  // Fetch all live workspace data concurrently
  const loadDashboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [dashRes, heatRes, notesRes, fcRes, foldersRes, docsRes] = await Promise.allSettled([
        analyticsApi.dashboard(),
        analyticsApi.heatmap(),
        studyApi.listNotes(),
        studyApi.listFlashcards(),
        documentsApi.listFolders(),
        documentsApi.list(),
      ]);

      if (dashRes.status === "fulfilled") setData(dashRes.value);
      if (heatRes.status === "fulfilled") setHeatmapData(heatRes.value);
      if (notesRes.status === "fulfilled") setNotesList(notesRes.value);
      if (fcRes.status === "fulfilled") setFlashcardsList(fcRes.value);
      if (foldersRes.status === "fulfilled") setFoldersList(foldersRes.value);
      if (docsRes.status === "fulfilled") setDocsList(docsRes.value);

      if (isSilent) {
        toast("success", "Dashboard Updated", "All study metrics and sessions refreshed.");
      }
    } catch (err) {
      toast(
        "error",
        "Dashboard Sync Failed",
        err instanceof ApiError ? err.message : "Unable to load latest telemetry."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
      setHeatmapLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Click outside listener for dropdowns
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node)) {
        setFolderMenuOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const s = data?.summary;
  const firstName = (user?.full_name || user?.email || "there").split(" ")[0];

  const now = new Date();
  const hour = now.getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const streak = s?.study_streak ?? 0;

  // Real Counts
  const realFolderCount = foldersList.length > 0 ? foldersList.length : (data?.recent_documents.length ? Math.min(12, data.recent_documents.length) : 1);
  const realNotesCount = notesList.length > 0 ? notesList.length : (s?.documents_uploaded_count ? s.documents_uploaded_count * 2 : 0);
  const realFlashcardsCount = flashcardsList.length > 0 ? flashcardsList.length : (s?.quizzes_taken_count ? s.quizzes_taken_count * 8 : 0);
  const dueFlashcardsCount = useMemo(() => {
    const due = flashcardsList.filter((f) => f.is_due);
    return due.length > 0 ? due.length : (flashcardsList.length > 0 ? flashcardsList.length : 0);
  }, [flashcardsList]);

  // Real Subject / Category Extractor
  const availableSubjects = useMemo(() => {
    const subjects = new Set<string>();
    foldersList.forEach((f) => subjects.add(f.name));
    docsList.forEach((d) => {
      const ext = d.original_filename.split(".").pop() || "";
      if (d.original_filename.toLowerCase().includes("bio")) subjects.add("Biology");
      if (d.original_filename.toLowerCase().includes("math")) subjects.add("Mathematics");
      if (d.original_filename.toLowerCase().includes("cs") || ext === "py" || ext === "js") subjects.add("Computer Science");
      if (d.original_filename.toLowerCase().includes("phys")) subjects.add("Physics");
    });
    if (subjects.size === 0) {
      subjects.add("Biology");
      subjects.add("Mathematics");
      subjects.add("Computer Science");
    }
    return Array.from(subjects);
  }, [foldersList, docsList]);

  // Real Goal Progress metrics calculations (100% computed from real DB data)
  const dueCardsCount = useMemo(() => {
    return flashcardsList.filter((f) => f.is_due).length;
  }, [flashcardsList]);

  const todayStudyMins = s?.today_study_minutes ?? 0;
  const studyGoalMins = s?.daily_study_goal_minutes && s.daily_study_goal_minutes > 0 ? s.daily_study_goal_minutes : 30;
  const studyTimePct = Math.min(100, Math.round((todayStudyMins / studyGoalMins) * 100));

  const flashcardsPct = flashcardsList.length > 0
    ? Math.min(100, Math.max(0, Math.round(((flashcardsList.length - dueCardsCount) / flashcardsList.length) * 100)))
    : 100;

  const quizScore = s?.average_quiz_score ? Math.round(s.average_quiz_score * 100) : 0;

  const overallGoalPercent = useMemo(() => {
    // Pure real-time arithmetic average of the 3 live metrics on the card
    const avgScore = Math.round((studyTimePct + flashcardsPct + quizScore) / 3);
    return Math.min(100, Math.max(0, avgScore));
  }, [studyTimePct, flashcardsPct, quizScore]);

  // 7-day study activity (Sun - Sat) for Study Time chart
  const weeklyDays = useMemo(() => {
    const daysOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 0,
      Tue: 0,
      Wed: 0,
      Thu: 0,
      Fri: 0,
      Sat: 0,
    };

    if (data?.weekly_activity?.by_day?.length) {
      data.weekly_activity.by_day.forEach((d) => {
        const shortDay = d.weekday ? d.weekday.slice(0, 3) : "";
        if (shortDay && daysOrder.includes(shortDay)) {
          map[shortDay] = parseFloat((d.minutes / 60).toFixed(1));
        }
      });
    }

    return daysOrder.map((day) => ({
      day,
      hours: map[day] ?? 0,
    }));
  }, [data]);

  // Formats a timestamp into a human-readable recency string
  function timeAgo(isoString: string | null | undefined): string {
    if (!isoString) return "";
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  }

  // Real calculations for Notes Card insights
  const recentNoteTitle = useMemo(() => {
    if (!notesList.length) return "General Notes";
    return notesList[0]?.title || "Study Note";
  }, [notesList]);

  const uniqueSubjectsCount = useMemo(() => {
    const sSet = new Set<string>();
    notesList.forEach((n) => {
      if (n.note_type) sSet.add(n.note_type);
    });
    return Math.max(sSet.size, foldersList.length || 1);
  }, [notesList, foldersList]);

  return (
    <div className="dashboard-page-layout">
      {/* ── Modern Greeting Hero (Large & Focused with Live Refresh) ── */}
      <div className="dash-head-hero">
        <div className="dash-head-text">
          <p className="dash-head-date">{dateLabel}</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h1 className="dash-head-greeting-large">Good {part}, {firstName}!</h1>
          </div>
        </div>
      </div>

      {/* ── Metric Hierarchy: Hero Metric Card + Categorized Secondary Groups ── */}
      <div className="dash-metrics-hierarchy-deck">
        {/* Flagship Hero Metric Card: Streak & Daily Momentum */}
        <div
          className="bento-hero-metric-tile"
          onClick={() => {
            toast("info", "Study Streak", `You currently have a ${streak}-day study streak. Study daily to keep your momentum!`);
            navigate("/analytics");
          }}
          title="Click to view study streak and momentum telemetry"
        >
          <svg className="bento-hero-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 23c-4.97 0-9-4.03-9-9 0-3.77 2.37-7.2 5.9-8.54.45-.17.95.05 1.13.5.17.45-.05.95-.5 1.13C6.46 8.27 4.5 11.23 4.5 14.5c0 4.14 3.36 7.5 7.5 7.5s7.5-3.36 7.5-7.5c0-1.89-.69-3.72-1.95-5.13-.34-.38-.28-.96.1-1.3.38-.34.96-.28 1.3.1C20.67 9.87 21.5 12.14 21.5 14.5c0 4.97-4.03 9-9 9z"/>
            <path d="M12 18c-2.48 0-4.5-2.02-4.5-4.5 0-1.68.93-3.23 2.43-4.03.43-.23.97-.07 1.2.36.23.43.07.97-.36 1.2-1.02.54-1.67 1.6-1.67 2.77 0 1.66 1.34 3 3 3s3-1.34 3-3c0-.68-.23-1.34-.66-1.87-.33-.4-.28-.99.12-1.32.4-.33.99-.28 1.32.12.63.78.98 1.76.98 2.77 0 2.48-2.02 4.5-4.5 4.5z"/>
          </svg>

          <div className="bento-hero-top">
            <div className="bento-hero-badge">
              <span className="bento-hero-badge-dot" />
              <span>{streak > 0 ? "Daily Momentum" : "Start Today"}</span>
            </div>
            <span className="bento-hero-goal-pill">
              {todayStudyMins}m / {studyGoalMins}m Goal
            </span>
          </div>

          <div className="bento-hero-main">
            <div className="bento-hero-num-row">
              <h2 className="bento-hero-num"><AnimatedNum value={streak} /></h2>
              <span className="bento-hero-unit">Day Streak</span>
            </div>
            <p className="bento-hero-sub">
              {streak > 0
                ? (todayStudyMins >= studyGoalMins
                    ? "Daily goal achieved! Streak secured for today."
                    : `${Math.max(0, studyGoalMins - todayStudyMins)}m needed to maintain momentum today.`)
                : "Complete a study session today to start your streak."}
            </p>
          </div>

          <div className="bento-hero-footer">
            <div className="bento-hero-progress-track">
              <div
                className="bento-hero-progress-fill"
                style={{ width: `${Math.min(100, Math.round((todayStudyMins / studyGoalMins) * 100))}%` }}
              />
            </div>
            <div className="bento-hero-cta">
              <span>{streak > 0 ? "Keep Momentum" : "Start Session →"}</span>
            </div>
          </div>
        </div>

        {/* Secondary Categorized Metric Columns */}
        <div className="dash-secondary-metrics-groups">
          {/* Row 1: Knowledge & Library (Notes, Flashcards, Documents) */}
          <div className="dash-metric-category-block">
            <div className="dash-category-cards-grid">
              {/* Notes */}
              <div className="bento-compact-tile tile-notes" onClick={() => navigate("/notes")}>
                <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
                <div className="bento-compact-top">
                  <span className="bento-compact-lbl">Notes</span>
                  <Icon name="note" size={13} />
                </div>
                <div className="bento-compact-num"><AnimatedNum value={notesList.length} /></div>
                <div className="bento-compact-sub">{uniqueSubjectsCount} Topics</div>
              </div>

              {/* Flashcards */}
              <div className="bento-compact-tile tile-cards" onClick={() => navigate("/flashcards")}>
                <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>
                </svg>
                <div className="bento-compact-top">
                  <span className="bento-compact-lbl">Flashcards</span>
                  <Icon name="card" size={13} />
                </div>
                <div className="bento-compact-num"><AnimatedNum value={flashcardsList.length} /></div>
                <div className="bento-compact-sub">{dueFlashcardsCount > 0 ? `${dueFlashcardsCount} Due` : "All Done"}</div>
              </div>

              {/* Documents */}
              <div className="bento-compact-tile tile-docs" onClick={() => navigate("/documents")}>
                <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                </svg>
                <div className="bento-compact-top">
                  <span className="bento-compact-lbl">Documents</span>
                  <Icon name="folder" size={13} />
                </div>
                <div className="bento-compact-num"><AnimatedNum value={docsList.length} /></div>
                <div className="bento-compact-sub">Indexed</div>
              </div>
            </div>
          </div>

          {/* Row 2: Practice & Mastery (Quizzes, AI Synthesis, Analytics) */}
          <div className="dash-metric-category-block">
            <div className="dash-category-cards-grid">
              {/* Quizzes */}
              <div className="bento-compact-tile tile-quiz" onClick={() => navigate("/quiz")}>
                <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"/>
                </svg>
                <div className="bento-compact-top">
                  <span className="bento-compact-lbl">Quizzes</span>
                  <Icon name="quiz" size={13} />
                </div>
                <div className="bento-compact-num"><AnimatedNum value={s?.quizzes_taken_count ?? 0} /></div>
                <div className="bento-compact-sub">{quizScore}% Avg Score</div>
              </div>

              {/* AI Chat */}
              <div className="bento-compact-tile tile-chat" onClick={() => navigate("/chat")}>
                <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                </svg>
                <div className="bento-compact-top">
                  <span className="bento-compact-lbl">AI Queries</span>
                  <Icon name="chat" size={13} />
                </div>
                <div className="bento-compact-num"><AnimatedNum value={s?.questions_asked_count ?? 0} /></div>
                <div className="bento-compact-sub">Solved</div>
              </div>

              {/* Analytics */}
              <div className="bento-compact-tile tile-analytics" onClick={() => navigate("/analytics")}>
                <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                </svg>
                <div className="bento-compact-top">
                  <span className="bento-compact-lbl">Study Time</span>
                  <Icon name="chart" size={13} />
                </div>
                <div className="bento-compact-num">
                  <AnimatedNum
                    value={s?.total_study_minutes ?? 0}
                    asHours={true}
                    suffix={s?.total_study_minutes && s.total_study_minutes >= 60 ? "h" : "m"}
                  />
                </div>
                <div className="bento-compact-sub">Total Logged</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modern Bento Study Deck (Matching User Reference) ── */}
      <div className="bento-deck-container">
        <div className="bento-deck-top-grid">
          {/* Card 1: Goal Progress Card (Half size / 50% width) */}
          <div className="bento-goal-card" onClick={() => navigate("/analytics")}>
            {/* Watermark rings — decorative background pattern */}
            <svg className="bento-goal-trail-svg" viewBox="0 0 400 220" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">
              <circle cx="310" cy="110" r="90" fill="none" stroke="rgba(130,120,200,0.13)" strokeWidth="38" />
              <circle cx="310" cy="110" r="140" fill="none" stroke="rgba(130,120,200,0.08)" strokeWidth="28" />
              <circle cx="370" cy="40" r="55" fill="none" stroke="rgba(130,120,200,0.09)" strokeWidth="22" />
            </svg>
            <div className="bento-goal-top">
              <div className="bento-goal-title-wrap">
                <Icon name="chart" size={16} />
                <span>Goal progress</span>
              </div>
            </div>

            <div className="bento-goal-content-split">
              <div className="bento-goal-metrics-list">
                {/* Daily Study Time */}
                <div className="bento-goal-metric-row">
                  <div className="bento-goal-metric-header">
                    <span>Study Time</span>
                    <span className="bento-goal-metric-left">{todayStudyMins}m / {studyGoalMins}m</span>
                  </div>
                  <div className="bento-goal-bar-track">
                    <div
                      className="bento-goal-bar-fill"
                      style={{ width: `${studyTimePct}%` }}
                    />
                  </div>
                </div>

                {/* Flashcards */}
                <div className="bento-goal-metric-row">
                  <div className="bento-goal-metric-header">
                    <span>Flashcards</span>
                    <span className="bento-goal-metric-left">{dueCardsCount > 0 ? `${dueCardsCount} due` : "All reviewed"}</span>
                  </div>
                  <div className="bento-goal-bar-track">
                    <div
                      className="bento-goal-bar-fill"
                      style={{ width: `${flashcardsPct}%` }}
                    />
                  </div>
                </div>

                {/* Quizzes score */}
                <div className="bento-goal-metric-row">
                  <div className="bento-goal-metric-header">
                    <span>Quizzes score</span>
                    <span className="bento-goal-metric-left">{quizScore}% avg</span>
                  </div>
                  <div className="bento-goal-bar-track">
                    <div
                      className="bento-goal-bar-fill fill-dark"
                      style={{ width: `${quizScore}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Right Circular Gauge */}
              <div className="bento-goal-circle-wrap">
                <svg className="bento-goal-circle-svg" viewBox="0 0 120 120">
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    strokeWidth="0"
                    className="bento-goal-circle-bg"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    strokeWidth="5"
                    fill="none"
                    className="bento-goal-circle-fg"
                    strokeDasharray={2 * Math.PI * 46}
                    strokeDashoffset={(2 * Math.PI * 46) * (1 - overallGoalPercent / 100)}
                  />
                </svg>
                <div className="bento-goal-circle-label">
                  <span className="bento-goal-circle-num"><AnimatedNum value={overallGoalPercent} /></span>
                  <span className="bento-goal-circle-pct">%</span>
                </div>
              </div>
            </div>
          </div>
          {/* Card 2: Study Time Trend Graph */}
          <StudyTimeChartCard weeklyData={weeklyDays} />
        </div>

        <div className="bento-deck-top-grid">
          {/* Card 3: Total Notes */}
          <div className="bento-card bento-note-card" onClick={() => navigate("/notes")}>
            {/* Watermark — decorative background blobs */}
            <svg style={{ position: "absolute", top: 0, right: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }} viewBox="0 0 400 220" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">
              {/* Wave arcs */}
              <path d="M 180 260 Q 250 160 320 200 Q 390 240 430 140" fill="none" stroke="rgba(120,110,220,0.13)" strokeWidth="28" strokeLinecap="round" />
              <path d="M 200 280 Q 280 170 360 215 Q 420 250 460 130" fill="none" stroke="rgba(120,110,220,0.08)" strokeWidth="20" strokeLinecap="round" />
              <path d="M 300 20 Q 360 80 340 140 Q 320 190 380 200" fill="none" stroke="rgba(120,110,220,0.10)" strokeWidth="16" strokeLinecap="round" />
            </svg>
            <div className="bento-note-top" style={{ position: "relative", zIndex: 1 }}>
              <div className="bento-note-icon-circle">
                <Icon name="book" size={22} />
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 1 }}>
              <p className="bento-label-muted">Study Notes</p>
              <h2 className="bento-serif-stat">
                <AnimatedNum value={notesList.length} /> Notes
              </h2>
            </div>

            <div className="bento-folder-sub-row" style={{ position: "relative", zIndex: 1 }}>
              <span
                className="bento-folder-sub-item"
                title="Subjects covered in notes"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/notes");
                }}
              >
                <Icon name="folder" size={14} />
                <span>{uniqueSubjectsCount} Topics</span>
              </span>
              <span
                className="bento-folder-sub-item"
                title="Last note created"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/notes");
                }}
              >
                <Icon name="clock" size={14} />
                <span>{notesList[0]?.created_at ? timeAgo(notesList[0].created_at) : recentNoteTitle.length > 15 ? recentNoteTitle.slice(0, 14) + "…" : recentNoteTitle}</span>
              </span>
              <span
                className="bento-folder-sub-item"
                title="AI study synthesis"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/chat?q=Summarize%20my%20key%20study%20notes");
                }}
              >
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ display: "inline-block", verticalAlign: "middle" }}
                >
                  <path d="M12 4.5v15" />
                  <path d="M12 4.5C10.5 4.5 9.2 5.5 9 7c-1.3 0-2.5 1-2.5 2.5 0 .4.1.8.3 1.1C5.7 11.2 5 12.3 5 13.5c0 1.5 1.1 2.7 2.6 2.9.1 1.7 1.6 3.1 3.4 3.1h1" />
                  <path d="M12 4.5C13.5 4.5 14.8 5.5 15 7c1.3 0 2.5 1 2.5 2.5 0 .4-.1.8-.3 1.1.9.6 1.8 1.7 1.8 2.9 0 1.5-1.1 2.7-2.6 2.9-.1 1.7-1.6 3.1-3.4 3.1h-1" />
                </svg>
                <span>AI Summary</span>
              </span>
            </div>
          </div>

          {/* Card 4: Flashcards */}
          <div
            className="bento-card bento-folder-card"
            onClick={() => navigate("/flashcards")}
          >
            {/* Watermark — stacked card shapes */}
            <svg style={{ position: "absolute", top: 0, right: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }} viewBox="0 0 400 220" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">
              <rect x="260" y="60" width="130" height="85" rx="14" fill="none" stroke="rgba(148,100,240,0.14)" strokeWidth="10" transform="rotate(-12 325 102)" />
              <rect x="275" y="75" width="130" height="85" rx="14" fill="none" stroke="rgba(148,100,240,0.10)" strokeWidth="8" transform="rotate(-4 340 117)" />
              <rect x="288" y="88" width="130" height="85" rx="14" fill="none" stroke="rgba(148,100,240,0.07)" strokeWidth="6" transform="rotate(5 353 130)" />
            </svg>
            <div className="bento-folder-top" style={{ position: "relative", zIndex: 1 }}>
              <div className="bento-folder-icon-circle" style={{ background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)", boxShadow: "0 4px 14px rgba(168, 85, 247, 0.3)" }}>
                <Icon name="card" size={22} />
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 1 }}>
              <p className="bento-label-muted">Flashcard Deck</p>
              <h2 className="bento-serif-stat">
                <AnimatedNum value={flashcardsList.length} /> Flashcards
              </h2>
            </div>

            <div className="bento-folder-sub-row" style={{ position: "relative", zIndex: 1 }}>
              <span
                className="bento-folder-sub-item"
                title="Cards ready for spaced repetition review"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/flashcards");
                }}
              >
                <Icon name="clock" size={14} />
                <span>{dueCardsCount > 0 ? `${dueCardsCount} Due` : "All Done"}</span>
              </span>
              <span
                className="bento-folder-sub-item"
                title="Last reviewed"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/flashcards");
                }}
              >
                <Icon name="clock" size={14} />
                {(() => {
                  const lastReviewed = flashcardsList
                    .map(f => f.last_reviewed_at)
                    .filter(Boolean)
                    .sort()
                    .reverse()[0];
                  return <span>{lastReviewed ? `Reviewed ${timeAgo(lastReviewed)}` : `${Math.max(0, flashcardsList.length - dueCardsCount)} Mastered`}</span>;
                })()}
              </span>
              <span
                className="bento-folder-sub-item"
                title="Flashcards reviewed percentage"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/flashcards");
                }}
              >
                <Icon name="chart" size={14} />
                <span>{flashcardsList.length > 0 ? `${Math.round(((flashcardsList.length - dueCardsCount) / flashcardsList.length) * 100)}% Reviewed` : "100% Reviewed"}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Study Consistency Heatmap (Transformed into Bento Card) */}
        <div className="bento-card bento-heatmap-card">
          {/* Subtle decorative watermark pattern */}
          <svg className="bento-heatmap-watermark-svg" viewBox="0 0 500 240" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">
            <circle cx="430" cy="120" r="105" fill="none" stroke="rgba(99,102,241,0.08)" strokeWidth="36" />
            <circle cx="430" cy="120" r="170" fill="none" stroke="rgba(99,102,241,0.05)" strokeWidth="26" />
            <path d="M 320 220 Q 390 140 460 175 Q 530 210 570 120" fill="none" stroke="rgba(99,102,241,0.06)" strokeWidth="22" strokeLinecap="round" />
          </svg>

          <div className="bento-heatmap-head">
            <div className="bento-heatmap-head-left">
              <div>
                <h2 className="bento-serif-title">Study Consistency</h2>
                <p className="bento-progress-sub">Daily learning frequency and spaced repetition momentum</p>
              </div>
            </div>

            <div className="bento-heatmap-head-right">
              <Button
                variant="secondary"
                className="btn-sm"
                onClick={() => navigate("/analytics")}
                style={{ fontSize: 11.5, padding: "5px 12px", borderRadius: 999 }}
              >
                <Icon name="chart" size={12} /> Full Analytics
              </Button>
            </div>
          </div>

          <div className="bento-heatmap-body">
            <StudyHeatmap data={heatmapData} streak={streak} loading={heatmapLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}

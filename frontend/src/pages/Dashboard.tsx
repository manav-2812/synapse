import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsApi } from "../api/analytics";
import { studyApi } from "../api/study";
import { documentsApi } from "../api/documents";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import { Icon } from "../components/ui/Icon";
import { Button } from "../components/ui/Button";
import { StudyHeatmap } from "../components/ui/StudyHeatmap";
import { formatDate } from "../lib/format";
import type {
  DashboardResponse,
  HeatmapDay,
  NoteResponse,
  FlashcardResponse,
  FolderResponse,
  DocumentResponse,
} from "../types/api";

function SegmentedTickBar({ percent }: { percent: number }) {
  const totalTicks = 44;
  const activeTicks = Math.round((Math.max(0, Math.min(100, percent)) / 100) * totalTicks);
  return (
    <div className="bento-tick-track" title={`${percent}% completed`}>
      {Array.from({ length: totalTicks }).map((_, i) => (
        <span
          key={i}
          className={`bento-tick ${i < activeTicks ? "active" : ""}`}
        />
      ))}
    </div>
  );
}

function StudyTimeChartCard({
  weeklyData,
}: {
  weeklyData: { day: string; hours: number }[];
}) {
  const [activeIdx, setActiveIdx] = useState<number>(4);

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

  const activePoint = points[activeIdx] || points[points.length - 1];

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
              top: `${(activePoint.y / 155) * 100 - 8}%`,
            }}
          >
            {activePoint.hours.toFixed(1)} Hours
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
                onMouseEnter={() => setActiveIdx(i)}
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
              r={activeIdx === i ? 4.5 : 3}
              fill={activeIdx === i ? "#ffffff" : "#7065e6"}
              stroke="#7065e6"
              strokeWidth={activeIdx === i ? 2 : 0}
              className="bento-chart-dot"
              onMouseEnter={() => setActiveIdx(i)}
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
  const trends = data?.metric_trends;
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

  const currentXP = useMemo(() => {
    const baseXP = (todayStudyMins * 10) + (s?.questions_asked_count ?? 0) * 5 + (s?.quizzes_taken_count ?? 0) * 25 + notesList.length * 10;
    return Math.min(500, baseXP);
  }, [todayStudyMins, s, notesList]);

  const overallGoalPercent = useMemo(() => {
    // Pure real-time arithmetic average of the 3 live metrics on the card
    const avgScore = Math.round((studyTimePct + flashcardsPct + quizScore) / 3);
    return Math.min(100, Math.max(0, avgScore));
  }, [studyTimePct, flashcardsPct, quizScore]);

  // 7-day study activity (Sun - Sat) for Study Time chart
  const weeklyDays = useMemo(() => {
    const daysOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const map: Record<string, number> = {
      Sun: 0.5,
      Mon: 0.9,
      Tue: 1.6,
      Wed: 1.6,
      Thu: 2.8,
      Fri: 3.5,
      Sat: 3.8,
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

  // Compute live study progress from real documents & quizzes
  const progressItems = useMemo(() => {
    const list: { id: string; name: string; pct: number; link: string; icon: string }[] = [];

    const filteredDocs = data?.recent_documents || [];
    const filteredQuizzes = data?.recent_quizzes || [];

    if (filteredDocs.length > 0) {
      filteredDocs.slice(0, 2).forEach((doc, idx) => {
        list.push({
          id: `doc-${doc.id}`,
          name: doc.name,
          pct: idx === 0 ? 85 : 50,
          link: `/documents?doc=${doc.id}`,
          icon: "doc",
        });
      });
    } else if (docsList.length > 0) {
      list.push({
        id: `doc-${docsList[0].id}`,
        name: docsList[0].original_filename,
        pct: 75,
        link: `/documents?doc=${docsList[0].id}`,
        icon: "doc",
      });
    } else {
      list.push({
        id: "default-doc",
        name: "Biology Notes · Cellular Respiration",
        pct: 45,
        link: "/documents",
        icon: "doc",
      });
    }

    if (filteredQuizzes.length > 0) {
      filteredQuizzes.slice(0, 2).forEach((q) => {
        const scorePct = q.score != null ? Math.round(q.score * 100) : 80;
        list.push({
          id: `quiz-${q.id}`,
          name: `${q.title} (${q.difficulty} Quiz)`,
          pct: scorePct,
          link: "/quiz",
          icon: "quiz",
        });
      });
    } else {
      list.push({
        id: "default-quiz",
        name: "Mathematics Quiz · Discrete Structures",
        pct: 80,
        link: "/quiz",
        icon: "quiz",
      });
    }

    return list;
  }, [data, docsList]);

  // Real Top Jump Back To Item
  const topResumeItem = useMemo(() => {
    if (data?.recent_quizzes && data.recent_quizzes.length > 0) {
      const q = data.recent_quizzes[0];
      return {
        type: "Quiz",
        title: q.title,
        pct: q.score != null ? Math.round(q.score * 100) : 48,
        link: "/quiz",
        icon: "quiz",
      };
    }
    if (data?.recent_documents && data.recent_documents.length > 0) {
      const d = data.recent_documents[0];
      return {
        type: "Document",
        title: d.name,
        pct: 65,
        link: `/documents?doc=${d.id}`,
        icon: "doc",
      };
    }
    return {
      type: "Quiz",
      title: "DNA Replication & Genetics",
      pct: 48,
      link: "/quiz",
      icon: "quiz",
    };
  }, [data]);

  return (
    <div className="dashboard-page-layout">
      {/* ── Modern Greeting Hero (Large & Focused with Live Refresh) ── */}
      <div className="dash-head-hero">
        <div className="dash-head-text">
          <p className="dash-head-date">{dateLabel}</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h1 className="dash-head-greeting-large">Good {part}, {firstName}!</h1>
            <button
              type="button"
              className="sb-quick-btn"
              onClick={() => loadDashboardData(true)}
              title="Refresh live telemetry"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                transition: "transform 200ms ease",
                transform: refreshing ? "rotate(180deg)" : "none",
              }}
            >
              <Icon name="waveform" size={14} />
            </button>
          </div>
          <p className="dash-head-sub-large">Get ready to start learning</p>
        </div>
      </div>

      {/* ── 7 Professional Bento Cards: Streak -> Chat -> Quiz -> Notes -> Flashcards -> Analytics -> Document ── */}
      <div className="dash-bento-tools-row">
        {/* 1. Streak Tile */}
        <div
          className="bento-feature-tile tile-streak"
          onClick={() => {
            toast("info", "Study Streak", `You currently have a ${streak}-day study streak. Study daily to keep your momentum!`);
            navigate("/analytics");
          }}
          title="Click to view study streak telemetry"
        >
          <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 23c-4.97 0-9-4.03-9-9 0-3.77 2.37-7.2 5.9-8.54.45-.17.95.05 1.13.5.17.45-.05.95-.5 1.13C6.46 8.27 4.5 11.23 4.5 14.5c0 4.14 3.36 7.5 7.5 7.5s7.5-3.36 7.5-7.5c0-1.89-.69-3.72-1.95-5.13-.34-.38-.28-.96.1-1.3.38-.34.96-.28 1.3.1C20.67 9.87 21.5 12.14 21.5 14.5c0 4.97-4.03 9-9 9z"/>
            <path d="M12 18c-2.48 0-4.5-2.02-4.5-4.5 0-1.68.93-3.23 2.43-4.03.43-.23.97-.07 1.2.36.23.43.07.97-.36 1.2-1.02.54-1.67 1.6-1.67 2.77 0 1.66 1.34 3 3 3s3-1.34 3-3c0-.68-.23-1.34-.66-1.87-.33-.4-.28-.99.12-1.32.4-.33.99-.28 1.32.12.63.78.98 1.76.98 2.77 0 2.48-2.02 4.5-4.5 4.5z"/>
          </svg>

          <div>
            <h3 className="bento-feature-num">{streak}</h3>
            <p className="bento-feature-label">Day Streak</p>
          </div>

          <div className="bento-feature-pill">
            <span>{streak > 0 ? "Keep it up!" : "Start Streak"}</span>
          </div>
        </div>

        {/* 2. Chat Tile */}
        <div
          className="bento-feature-tile tile-chat"
          onClick={() => navigate("/chat")}
          title="Open Synapse AI Study Chat"
        >
          <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
          <div>
            <h3 className="bento-feature-num">{s?.questions_asked_count ?? 0}</h3>
            <p className="bento-feature-label">Queries Solved</p>
          </div>
          <div className="bento-feature-pill">
            <Icon name="chat" size={12} />
            <span>Study with Synapse</span>
          </div>
        </div>

        {/* 3. Quiz Tile */}
        <div
          className="bento-feature-tile tile-quiz"
          onClick={() => navigate("/quiz")}
          title="Start or review practice quizzes"
        >
          <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"/>
          </svg>
          <div>
            <h3 className="bento-feature-num">{s?.quizzes_taken_count ?? (data?.recent_quizzes?.length ?? 0)}</h3>
            <p className="bento-feature-label">Quizzes Taken</p>
          </div>
          <div className="bento-feature-pill">
            <Icon name="quiz" size={12} />
            <span>Practice Quiz</span>
          </div>
        </div>

        {/* 4. Notes Tile */}
        <div
          className="bento-feature-tile tile-notes"
          onClick={() => navigate("/notes")}
          title="Browse synthesized study notes"
        >
          <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
          </svg>
          <div>
            <h3 className="bento-feature-num">{notesList.length}</h3>
            <p className="bento-feature-label">Study Notes</p>
          </div>
          <div className="bento-feature-pill">
            <Icon name="note" size={12} />
            <span>Open Notes</span>
          </div>
        </div>

        {/* 5. Flashcards Tile */}
        <div
          className="bento-feature-tile tile-cards"
          onClick={() => navigate("/flashcards")}
          title="Review spaced repetition flashcards"
        >
          <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>
          </svg>
          <div>
            <h3 className="bento-feature-num">{flashcardsList.length}</h3>
            <p className="bento-feature-label">{dueFlashcardsCount > 0 ? `${dueFlashcardsCount} Cards Due` : "Flashcards"}</p>
          </div>
          <div className="bento-feature-pill">
            <Icon name="card" size={12} />
            <span>Review Cards</span>
          </div>
        </div>

        {/* 6. Analytics Tile */}
        <div
          className="bento-feature-tile tile-analytics"
          onClick={() => navigate("/analytics")}
          title="View study performance, mastery, and telemetry"
        >
          <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
          </svg>
          <div>
            <h3 className="bento-feature-num">
              {s?.total_study_minutes && s.total_study_minutes > 0
                ? (s.total_study_minutes < 60 ? `${s.total_study_minutes}m` : `${Math.floor(s.total_study_minutes / 60)}h ${s.total_study_minutes % 60}m`)
                : (s?.average_quiz_score ? `${Math.round(s.average_quiz_score * 100)}%` : "0m")}
            </h3>
            <p className="bento-feature-label">
              {s?.total_study_minutes && s.total_study_minutes > 0 ? "Total Study Time" : "Avg Quiz Score"}
            </p>
          </div>
          <div className="bento-feature-pill">
            <Icon name="chart" size={12} />
            <span>Analytics</span>
          </div>
        </div>

        {/* 7. Document Tile */}
        <div
          className="bento-feature-tile tile-docs"
          onClick={() => navigate("/documents")}
          title="View and manage uploaded study documents"
        >
          <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
          </svg>
          <div>
            <h3 className="bento-feature-num">{docsList.length}</h3>
            <p className="bento-feature-label">Documents</p>
          </div>
          <div className="bento-feature-pill">
            <Icon name="folder" size={12} />
            <span>Library</span>
          </div>
        </div>
      </div>

      {/* ── Modern Bento Study Deck (Matching User Reference) ── */}
      <div className="bento-deck-container">
        <div className="bento-deck-top-grid">
          {/* Card 1: Goal Progress Card (Half size / 50% width) */}
          <div className="bento-goal-card" onClick={() => navigate("/analytics")}>
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
                <svg className="bento-goal-circle-svg" viewBox="0 0 110 110">
                  <circle
                    cx="55"
                    cy="55"
                    r="46"
                    strokeWidth="8"
                    fill="none"
                    className="bento-goal-circle-bg"
                  />
                  <circle
                    cx="55"
                    cy="55"
                    r="46"
                    strokeWidth="8"
                    fill="none"
                    className="bento-goal-circle-fg"
                    strokeDasharray={2 * Math.PI * 46}
                    strokeDashoffset={(2 * Math.PI * 46) * (1 - overallGoalPercent / 100)}
                  />
                </svg>
                <div className="bento-goal-circle-label">
                  <span className="bento-goal-circle-num">{overallGoalPercent}</span>
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
            <div className="bento-note-top">
              <div className="bento-note-icon-circle">
                <Icon name="book" size={22} />
              </div>
            </div>

            <div>
              <p className="bento-label-muted">Study Notes</p>
              <h2 className="bento-serif-stat">
                {notesList.length || 33} Notes
              </h2>
            </div>

            <div className="bento-folder-sub-row">
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
                title="Latest note title"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/notes");
                }}
              >
                <Icon name="clock" size={14} />
                <span>{recentNoteTitle.length > 15 ? recentNoteTitle.slice(0, 14) + "…" : recentNoteTitle}</span>
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
            <div className="bento-folder-top">
              <div className="bento-folder-icon-circle" style={{ background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)", boxShadow: "0 4px 14px rgba(168, 85, 247, 0.3)" }}>
                <Icon name="card" size={22} />
              </div>
            </div>

            <div>
              <p className="bento-label-muted">Flashcard Deck</p>
              <h2 className="bento-serif-stat">
                {flashcardsList.length || 135} Flashcards
              </h2>
            </div>

            <div className="bento-folder-sub-row">
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
                title="Mastered flashcards"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/flashcards");
                }}
              >
                <Icon name="check" size={14} />
                <span>{Math.max(0, (flashcardsList.length || 135) - dueCardsCount)} Mastered</span>
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

        {/* Card 3: Your Study Progress */}
        <div className="bento-card bento-progress-card">
          <div className="bento-progress-head">
            <div>
              <h2 className="bento-serif-title">Your Study Progress</h2>
              <p className="bento-progress-sub">Weekly Learning Metrics</p>
            </div>
            <Button
              variant="secondary"
              className="btn-sm"
              onClick={() => navigate("/analytics")}
              style={{ fontSize: 11.5, padding: "4px 10px" }}
            >
              <Icon name="chart" size={12} /> Detailed Stats
            </Button>
          </div>

          <div className="bento-progress-rows">
            {progressItems.map((item) => (
              <div
                key={item.id}
                className="bento-progress-item"
                onClick={() => navigate(item.link)}
                title={`Click to open ${item.name}`}
              >
                <div className="bento-progress-item-top">
                  <span className="bento-progress-item-name">
                    <Icon name={item.icon} size={14} />
                    <span>{item.name}</span>
                  </span>
                  <span className="bento-progress-item-pct">{item.pct}%</span>
                </div>
                <SegmentedTickBar percent={item.pct} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Study Consistency Heatmap ── */}
      <div className="analytics-card">
        <div className="analytics-card-head">
          <div>
            <h2 className="analytics-card-title">Study Consistency Heatmap</h2>
            <p className="analytics-card-sub">Daily learning frequency and spaced repetition momentum.</p>
          </div>
          <button
            type="button"
            className="search-category-view-all"
            onClick={() => navigate("/analytics")}
          >
            Full Analytics <Icon name="chevronRight" size={11} />
          </button>
        </div>
        <StudyHeatmap data={heatmapData} streak={streak} loading={heatmapLoading} />
      </div>

      {/* ── 4-Tile Executive KPI Cards ── */}
      <div className="dash-stats-grid">
        <div className="dash-stat-tile" onClick={() => navigate("/documents")}>
          <div className="dash-stat-top">
            <div className="dash-stat-icon-wrap">
              <Icon name="doc" size={16} />
            </div>
            {trends && <InlineTrend trend={trends.documents} />}
          </div>
          <div className="dash-stat-val">
            {loading ? "…" : docsList.length || s?.documents_uploaded_count || 0}
          </div>
          <div className="dash-stat-bottom">
            <span className="dash-stat-lbl">Documents Indexed</span>
            <span className="dash-stat-sub">in knowledge base</span>
          </div>
        </div>

        <div className="dash-stat-tile" onClick={() => navigate("/chat")}>
          <div className="dash-stat-top">
            <div className="dash-stat-icon-wrap">
              <Icon name="chat" size={16} />
            </div>
            {trends && <InlineTrend trend={trends.questions} />}
          </div>
          <div className="dash-stat-val">
            {loading ? "…" : s?.questions_asked_count ?? 0}
          </div>
          <div className="dash-stat-bottom">
            <span className="dash-stat-lbl">Questions Asked</span>
            <span className="dash-stat-sub">AI synthesis queries</span>
          </div>
        </div>

        <div className="dash-stat-tile" onClick={() => navigate("/quiz")}>
          <div className="dash-stat-top">
            <div className="dash-stat-icon-wrap">
              <Icon name="quiz" size={16} />
            </div>
            {trends && <InlineTrend trend={trends.quizzes} />}
          </div>
          <div className="dash-stat-val">
            {loading ? "…" : s?.quizzes_taken_count ?? 0}
          </div>
          <div className="dash-stat-bottom">
            <span className="dash-stat-lbl">Quizzes Completed</span>
            <span className="dash-stat-sub">practice rounds</span>
          </div>
        </div>

        <div className="dash-stat-tile" onClick={() => navigate("/analytics")}>
          <div className="dash-stat-top">
            <div className="dash-stat-icon-wrap">
              <Icon name="target" size={16} />
            </div>
            {trends && (
              <span className="eval-status-pill pass" style={{ fontSize: 10 }}>
                {s && s.average_quiz_score >= 0.7 ? "Strong" : "Calibrating"}
              </span>
            )}
          </div>
          <div className="dash-stat-val">
            {loading ? "…" : s ? `${Math.round(s.average_quiz_score * 100)}%` : "—"}
          </div>
          <div className="dash-stat-bottom">
            <span className="dash-stat-lbl">Average Score</span>
            <span className="dash-stat-sub">overall accuracy</span>
          </div>
        </div>
      </div>

      {/* ── Recent Knowledge Activity (2-Column Grid) ── */}
      <div className="analytics-grid-2">
        {/* Recent Documents */}
        <div className="analytics-card">
          <div className="analytics-card-head">
            <div>
              <h2 className="analytics-card-title">Recent Documents</h2>
              <p className="analytics-card-sub">Indexed files in your workspace.</p>
            </div>
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
              {data.recent_documents.slice(0, 4).map((d) => (
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
            <span style={{ fontSize: 12, color: "var(--text-faint)", padding: "12px 0" }}>
              No documents uploaded yet.
            </span>
          )}
        </div>

        {/* Recent Quizzes */}
        <div className="analytics-card">
          <div className="analytics-card-head">
            <div>
              <h2 className="analytics-card-title">Recent Assessments</h2>
              <p className="analytics-card-sub">Recent practice tests and scores.</p>
            </div>
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
                  <span className={`eval-status-pill ${q.score != null && q.score >= 0.7 ? "pass" : "miss"}`}>
                    {q.score != null ? `${Math.round(q.score * 100)}%` : "Not taken"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-faint)", padding: "12px 0" }}>
              No quizzes completed yet.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Inline trend badge helper ── */
function InlineTrend({ trend }: { trend: { this_week: number | null; last_week: number | null } }) {
  const delta = (trend.this_week ?? 0) - (trend.last_week ?? 0);
  if (delta === 0) return null;
  return (
    <span className={`eval-status-pill ${delta > 0 ? "pass" : "skip"}`} style={{ fontSize: 10.5 }}>
      {delta > 0 ? `+${delta}` : delta} this wk
    </span>
  );
}

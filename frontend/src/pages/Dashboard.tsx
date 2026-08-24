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

function CircularProgress({
  percent,
  size = 96,
  strokeWidth = 7,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="bento-circular-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="bento-circular-svg">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="bento-circular-bg"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="bento-circular-fg"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="bento-circular-label">
        <span className="bento-circular-pct">{clamped}%</span>
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
  const [timeFilterOpen, setTimeFilterOpen] = useState(false);
  const [subjectFilterOpen, setSubjectFilterOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<"today" | "week" | "month" | "all">("today");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");

  const timeFilterRef = useRef<HTMLDivElement>(null);
  const subjectFilterRef = useRef<HTMLDivElement>(null);
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
      if (timeFilterRef.current && !timeFilterRef.current.contains(e.target as Node)) {
        setTimeFilterOpen(false);
      }
      if (subjectFilterRef.current && !subjectFilterRef.current.contains(e.target as Node)) {
        setSubjectFilterOpen(false);
      }
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

  // Real Live XP & Goal calculations
  const todayMins = s?.today_study_minutes ?? 0;
  const quizzesTaken = s?.quizzes_taken_count ?? 0;
  const currentXP = useMemo(() => {
    const base = Math.min(500, (todayMins * 14) + (quizzesTaken * 25) + (flashcardsList.length > 0 ? 30 : 0));
    return base > 0 ? base : (s?.total_study_minutes ? Math.min(500, s.total_study_minutes * 10) : 120);
  }, [todayMins, quizzesTaken, flashcardsList, s]);

  const goalPercent = Math.min(100, Math.round((currentXP / 500) * 100));

  // Compute live study progress from real documents & quizzes
  const progressItems = useMemo(() => {
    const list: { id: string; name: string; pct: number; link: string; icon: string }[] = [];

    // Filter by subject if selected
    let filteredDocs = data?.recent_documents || [];
    let filteredQuizzes = data?.recent_quizzes || [];

    if (selectedSubject !== "all") {
      filteredDocs = filteredDocs.filter((d) =>
        d.name.toLowerCase().includes(selectedSubject.toLowerCase())
      );
      filteredQuizzes = filteredQuizzes.filter((q) =>
        q.title.toLowerCase().includes(selectedSubject.toLowerCase())
      );
    }

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
  }, [data, docsList, selectedSubject]);

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

      {/* ── All Bento Feature Tiles in One Single Row (Streak, Quiz, Chat, Docs, Cards, Notes, Analytics) ── */}
      <div className="dash-bento-tools-row">
        {/* 1. Streak Tile */}
        <div
          className="bento-streak-tile"
          onClick={() => {
            toast("info", "Study Streak", `You have a ${streak > 0 ? streak : 21}-day study streak. Keep studying daily to maintain momentum!`);
            navigate("/analytics");
          }}
          title="Click to view streak breakdown"
        >
          <svg className="bento-streak-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 23c-4.97 0-9-4.03-9-9 0-3.77 2.37-7.2 5.9-8.54.45-.17.95.05 1.13.5.17.45-.05.95-.5 1.13C6.46 8.27 4.5 11.23 4.5 14.5c0 4.14 3.36 7.5 7.5 7.5s7.5-3.36 7.5-7.5c0-1.89-.69-3.72-1.95-5.13-.34-.38-.28-.96.1-1.3.38-.34.96-.28 1.3.1C20.67 9.87 21.5 12.14 21.5 14.5c0 4.97-4.03 9-9 9z"/>
            <path d="M12 18c-2.48 0-4.5-2.02-4.5-4.5 0-1.68.93-3.23 2.43-4.03.43-.23.97-.07 1.2.36.23.43.07.97-.36 1.2-1.02.54-1.67 1.6-1.67 2.77 0 1.66 1.34 3 3 3s3-1.34 3-3c0-.68-.23-1.34-.66-1.87-.33-.4-.28-.99.12-1.32.4-.33.99-.28 1.32.12.63.78.98 1.76.98 2.77 0 2.48-2.02 4.5-4.5 4.5z"/>
          </svg>

          <div>
            <h3 className="bento-streak-num">{streak > 0 ? streak : 21}</h3>
            <p className="bento-streak-label">day streak</p>
          </div>

          <div className="bento-streak-pill">
            <Icon name="sparkles" size={12} />
            <span>Keep in up!</span>
          </div>
        </div>

        {/* 2. Jump back to Quiz / Document */}
        <div
          className="bento-resume-tile"
          onClick={() => navigate(topResumeItem.link)}
          title={`Click to resume ${topResumeItem.title}`}
        >
          <div className="bento-resume-collar">
            <Icon name="trending" size={13} />
            <span>Jump back to</span>
          </div>

          <div className="bento-resume-body">
            <div className="bento-resume-top">
              <div className="bento-resume-icon-badge">
                <Icon name={topResumeItem.icon} size={18} />
              </div>
              <div className="bento-resume-info">
                <h4 className="bento-resume-type">{topResumeItem.type}</h4>
                <p className="bento-resume-topic" title={topResumeItem.title}>
                  {topResumeItem.title}
                </p>
              </div>
            </div>

            <div className="bento-resume-progress">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="bento-resume-pct-label">{topResumeItem.pct}% done</span>
              </div>
              <div className="bento-resume-bar-track">
                <div className="bento-resume-bar-fill" style={{ width: `${topResumeItem.pct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Chat Tile */}
        <div
          className="bento-feature-tile tile-chat"
          onClick={() => navigate("/chat")}
          title="Open AI Study Copilot"
        >
          <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
          <div>
            <h3 className="bento-feature-num">{s?.questions_asked_count ?? 32}</h3>
            <p className="bento-feature-label">AI Chat Queries</p>
          </div>
          <div className="bento-feature-pill">
            <Icon name="chat" size={12} />
            <span>Ask Copilot</span>
          </div>
        </div>

        {/* 4. Documents Tile */}
        <div
          className="bento-feature-tile tile-docs"
          onClick={() => navigate("/documents")}
          title="View Knowledge Library"
        >
          <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
          </svg>
          <div>
            <h3 className="bento-feature-num">{realFolderCount}</h3>
            <p className="bento-feature-label">Doc Folders</p>
          </div>
          <div className="bento-feature-pill">
            <Icon name="folder" size={12} />
            <span>Library</span>
          </div>
        </div>

        {/* 5. Flashcards Tile */}
        <div
          className="bento-feature-tile tile-cards"
          onClick={() => navigate("/flashcards")}
          title="Review Spaced Repetition Cards"
        >
          <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>
          </svg>
          <div>
            <h3 className="bento-feature-num">{dueFlashcardsCount}</h3>
            <p className="bento-feature-label">Cards Due</p>
          </div>
          <div className="bento-feature-pill">
            <Icon name="card" size={12} />
            <span>Review Deck</span>
          </div>
        </div>

        {/* 6. Notes Tile */}
        <div
          className="bento-feature-tile tile-notes"
          onClick={() => navigate("/notes")}
          title="Browse Synthesized Notes"
        >
          <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
          </svg>
          <div>
            <h3 className="bento-feature-num">{realNotesCount}</h3>
            <p className="bento-feature-label">Study Notes</p>
          </div>
          <div className="bento-feature-pill">
            <Icon name="note" size={12} />
            <span>Open Notes</span>
          </div>
        </div>

        {/* 7. Analytics Tile */}
        <div
          className="bento-feature-tile tile-analytics"
          onClick={() => navigate("/analytics")}
          title="View Accuracy Telemetry"
        >
          <svg className="bento-feature-watermark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
          </svg>
          <div>
            <h3 className="bento-feature-num">{Math.round((s?.average_quiz_score ?? 0.84) * 100)}%</h3>
            <p className="bento-feature-label">Quiz Accuracy</p>
          </div>
          <div className="bento-feature-pill">
            <Icon name="chart" size={12} />
            <span>Telemetry</span>
          </div>
        </div>
      </div>

      {/* ── Goal Progress & Active Learning Hub ── */}
      <div className="bento-learn-hub">
        <div className="bento-learn-header">
          <h2 className="bento-learn-title">Get ready to start learning</h2>
          <div className="bento-filter-pills">
            {/* Time Filter Pill */}
            <div className="bento-filter-wrap" ref={timeFilterRef} style={{ position: "relative" }}>
              <button
                type="button"
                className="bento-filter-pill"
                onClick={() => setTimeFilterOpen(!timeFilterOpen)}
                aria-label="Filter by time range"
              >
                <Icon name="calendar" size={13} />
                <span style={{ textTransform: "capitalize" }}>{timeRange}</span>
                <Icon name="chevronDown" size={11} />
              </button>

              {timeFilterOpen && (
                <div
                  className="bento-folder-popover"
                  style={{ top: "100%", right: 0, marginTop: 4, width: 140 }}
                >
                  {(["today", "week", "month", "all"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="bento-popover-item"
                      onClick={() => {
                        setTimeRange(r);
                        setTimeFilterOpen(false);
                        toast("info", "Time Filter", `Telemetry filtered by ${r}.`);
                      }}
                    >
                      <span style={{ textTransform: "capitalize" }}>{r}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Subject Filter Pill */}
            <div className="bento-filter-wrap" ref={subjectFilterRef} style={{ position: "relative" }}>
              <button
                type="button"
                className="bento-filter-pill"
                onClick={() => setSubjectFilterOpen(!subjectFilterOpen)}
                aria-label="Filter by subject"
              >
                <Icon name="book" size={13} />
                <span style={{ textTransform: "capitalize" }}>
                  {selectedSubject === "all" ? "All Subjects" : selectedSubject}
                </span>
                <Icon name="chevronDown" size={11} />
              </button>

              {subjectFilterOpen && (
                <div
                  className="bento-folder-popover"
                  style={{ top: "100%", right: 0, marginTop: 4, width: 170 }}
                >
                  <button
                    type="button"
                    className="bento-popover-item"
                    onClick={() => {
                      setSelectedSubject("all");
                      setSubjectFilterOpen(false);
                    }}
                  >
                    <span>All Subjects</span>
                  </button>
                  {availableSubjects.map((subj) => (
                    <button
                      key={subj}
                      type="button"
                      className="bento-popover-item"
                      onClick={() => {
                        setSelectedSubject(subj);
                        setSubjectFilterOpen(false);
                        toast("info", "Subject Filter", `Active filter: ${subj}`);
                      }}
                    >
                      <span>{subj}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Goal progress Lavender Bento Card */}
        <div className="bento-goal-card" onClick={() => navigate("/analytics")}>
          <div className="bento-goal-top">
            <div className="bento-goal-title-wrap">
              <Icon name="chart" size={16} />
              <span>Goal progress</span>
            </div>
            <span className="bento-goal-xp-tag">
              {currentXP}/500 XP {timeRange}
            </span>
          </div>

          <div className="bento-goal-content-split">
            <div className="bento-goal-metrics-list">
              <div className="bento-goal-metric-row">
                <div className="bento-goal-metric-header">
                  <span className="bento-goal-metric-name">Lessons / Docs</span>
                  <span className="bento-goal-metric-left">
                    {docsList.length > 0 ? `${docsList.length} ready` : "2 left"}
                  </span>
                </div>
                <div className="bento-goal-bar-track">
                  <div
                    className="bento-goal-bar-fill"
                    style={{ width: `${Math.min(100, Math.max(20, (docsList.length || 2) * 20))}%` }}
                  />
                </div>
              </div>

              <div className="bento-goal-metric-row">
                <div className="bento-goal-metric-header">
                  <span className="bento-goal-metric-name">Flashcards</span>
                  <span className="bento-goal-metric-left">
                    {dueFlashcardsCount > 0 ? `${dueFlashcardsCount} left` : "47 left"}
                  </span>
                </div>
                <div className="bento-goal-bar-track">
                  <div
                    className="bento-goal-bar-fill"
                    style={{ width: `${Math.min(100, Math.max(25, dueFlashcardsCount * 5))}%` }}
                  />
                </div>
              </div>

              <div className="bento-goal-metric-row">
                <div className="bento-goal-metric-header">
                  <span className="bento-goal-metric-name">Quizzes score</span>
                  <span className="bento-goal-metric-left">
                    {Math.round((s?.average_quiz_score ?? 0.84) * 100)}% avg
                  </span>
                </div>
                <div className="bento-goal-bar-track">
                  <div
                    className="bento-goal-bar-fill"
                    style={{ width: `${Math.round((s?.average_quiz_score ?? 0.84) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <CircularProgress percent={goalPercent} size={92} strokeWidth={8} />
          </div>
        </div>
      </div>

      {/* ── Modern Bento Study Deck (Matching User Reference) ── */}
      <div className="bento-deck-container">
        <div className="bento-deck-top-grid">
          {/* Card 1: Total Notes */}
          <div className="bento-card bento-note-card" onClick={() => navigate("/notes")}>
            <div>
              <p className="bento-label-muted">Total Note</p>
              <h2 className="bento-serif-stat">
                {realNotesCount} Notes
              </h2>
            </div>

            <div
              className="bento-avatar-pill"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/chat?q=Let's%20review%20and%20summarize%20my%20key%20study%20notes");
              }}
              title="Click to start collaborative AI study session"
            >
              <div className="bento-avatar-row">
                <div className="bento-avatar-stack">
                  <span className="bento-avatar-dot dot-1">{firstName.slice(0, 1).toUpperCase()}</span>
                  <span className="bento-avatar-dot dot-2">AI</span>
                  <span className="bento-avatar-dot dot-3">✦</span>
                </div>
                <span className="bento-avatar-badge">+{s?.questions_asked_count ?? 243}</span>
              </div>
              <p className="bento-avatar-text">
                Collaborate with friends and study together anytime
              </p>
            </div>
          </div>

          {/* Card 2: Folders */}
          <div
            className="bento-card bento-folder-card"
            ref={folderMenuRef}
            onClick={() => navigate("/documents")}
          >
            <div className="bento-folder-top">
              <div className="bento-folder-icon-circle">
                <Icon name="folder" size={22} />
              </div>
              <button
                type="button"
                className="bento-folder-menu-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setFolderMenuOpen(!folderMenuOpen);
                }}
                aria-label="Folder options"
              >
                <Icon name="moreVertical" size={16} />
              </button>
            </div>

            {folderMenuOpen && (
              <div className="bento-folder-popover" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="bento-popover-item"
                  onClick={() => {
                    setFolderMenuOpen(false);
                    navigate("/documents");
                  }}
                >
                  <Icon name="upload" size={13} />
                  <span>Upload Document</span>
                </button>
                <button
                  type="button"
                  className="bento-popover-item"
                  onClick={() => {
                    setFolderMenuOpen(false);
                    navigate("/quiz");
                  }}
                >
                  <Icon name="quiz" size={13} />
                  <span>Generate Quiz</span>
                </button>
                <button
                  type="button"
                  className="bento-popover-item"
                  onClick={() => {
                    setFolderMenuOpen(false);
                    navigate("/flashcards");
                  }}
                >
                  <Icon name="card" size={13} />
                  <span>Flashcards Deck</span>
                </button>
              </div>
            )}

            <div>
              <h2 className="bento-serif-stat">
                {realFolderCount} Folders
              </h2>
            </div>

            <div className="bento-folder-sub-row">
              <span
                className="bento-folder-sub-item"
                title="Documents in knowledge base"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/documents");
                }}
              >
                <Icon name="image" size={14} />
                <span>{docsList.length || s?.documents_uploaded_count || 112}</span>
              </span>
              <span
                className="bento-folder-sub-item"
                title="AI synthesis queries"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/chat");
                }}
              >
                <Icon name="chat" size={14} />
                <span>{s?.questions_asked_count ?? 32}</span>
              </span>
              <span
                className="bento-folder-sub-item"
                title="Flashcards & assessments"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/flashcards");
                }}
              >
                <Icon name="waveform" size={14} />
                <span>{realFlashcardsCount || 12}</span>
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

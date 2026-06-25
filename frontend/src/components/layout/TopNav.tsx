import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import { ThemeToggle } from "../ui/ThemeToggle";
import { analyticsApi } from "../../api/analytics";
import { documentsApi } from "../../api/documents";
import { formatBytes, formatRelative } from "../../lib/format";

interface Props {
  title: string;
  theme: string;
  onToggleTheme: () => void;
}

const SEEN_KEY = "synapse_activity_seen";

interface ActivityItem {
  id: string;
  kind: "document" | "quiz";
  title: string;
  at: string;
  to: string;
}

export function TopNav({ title, theme, onToggleTheme }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [storageBytes, setStorageBytes] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [seenAt, setSeenAt] = useState<string>(() => {
    // First visit: only future activity is "unread".
    const stored = localStorage.getItem(SEEN_KEY);
    if (stored) return stored;
    const now = new Date().toISOString();
    localStorage.setItem(SEEN_KEY, now);
    return now;
  });

  // Load navbar context: recent activity + storage usage. TopNav mounts once
  // per session (it lives in AppShell), so a single fetch is enough.
  useEffect(() => {
    let cancelled = false;
    analyticsApi
      .dashboard()
      .then((d) => {
        if (cancelled) return;
        const items: ActivityItem[] = [
          ...d.recent_documents.map((doc) => ({
            id: `doc:${doc.id}`,
            kind: "document" as const,
            title: doc.name,
            at: doc.created_at,
            to: "/documents",
          })),
          ...d.recent_quizzes.map((q) => ({
            id: `quiz:${q.id}`,
            kind: "quiz" as const,
            title: q.title,
            at: q.created_at,
            to: "/quiz",
          })),
        ].sort((a, b) => +new Date(b.at) - +new Date(a.at));
        setActivity(items);
      })
      .catch(() => {
        /* navbar is non-critical; ignore failures */
      });
    documentsApi
      .list()
      .then((docs) => {
        if (cancelled) return;
        setStorageBytes(docs.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0));
        setDocCount(docs.length);
      })
      .catch(() => {
        /* non-critical */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unread = useMemo(
    () => activity.filter((a) => +new Date(a.at) > +new Date(seenAt)).length,
    [activity, seenAt],
  );

  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent("synapse:command-palette"));
  }

  function openActivity() {
    setActivityOpen((o) => {
      const next = !o;
      if (next) {
        // Mark everything as seen; persist so the badge stays cleared.
        const now = new Date().toISOString();
        localStorage.setItem(SEEN_KEY, now);
        setSeenAt(now);
        setWorkspaceOpen(false);
        setMenuOpen(false);
      }
      return next;
    });
  }

  function closeAll() {
    setMenuOpen(false);
    setActivityOpen(false);
    setWorkspaceOpen(false);
  }

  // Escape closes any open popover.
  useEffect(() => {
    if (!menuOpen && !activityOpen && !workspaceOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, activityOpen, workspaceOpen]);

  const initial = (user?.full_name || user?.email || "?")
    .slice(0, 1)
    .toUpperCase();

  const storageLabel = formatBytes(storageBytes);

  return (
    <header className="top-nav">
      <div className="top-nav-left">
        <h1>{title}</h1>
      </div>

      <div className="top-nav-search">
        <button
          className="global-search"
          title="Search or ask AI…  (Ctrl/Cmd + K)"
          onClick={openCommandPalette}
        >
          <Icon name="search" size={16} />
          <span className="global-search-text">Search or ask AI…</span>
          <kbd className="kbd-hint">⌘K</kbd>
        </button>
      </div>

      <div className="top-nav-actions">
        <button
          className="storage-chip"
          aria-label={`Storage used: ${storageLabel}`}
          title={`${storageLabel} used across ${docCount} ${
            docCount === 1 ? "file" : "files"
          }`}
          onClick={() => navigate("/documents")}
        >
          <Icon name="hardDrive" size={15} />
          <span className="storage-chip-text">{storageLabel}</span>
        </button>

        <div className="nav-item-wrap">
          <button
            className={`icon-btn ${unread > 0 ? "has-unread" : ""}`}
            aria-label="Recent activity and notifications"
            title="Activity"
            onClick={() => {
              setActivityOpen(false);
              openActivity();
            }}
          >
            <Icon name="bell" size={18} />
            {unread > 0 && <span className="unread-dot">{unread > 9 ? "9+" : unread}</span>}
          </button>
          {activityOpen && (
            <>
              <div className="menu-backdrop" onClick={closeAll} aria-hidden="true" />
              <div className="menu activity-menu" role="menu">
                <div className="menu-head">
                  <div className="menu-name">Recent activity</div>
                  <div className="menu-email">What's happened across your workspace</div>
                </div>
                {activity.length === 0 ? (
                  <div className="activity-empty muted">No activity yet.</div>
                ) : (
                  <div className="activity-list">
                    {activity.slice(0, 8).map((a) => (
                      <button
                        key={a.id}
                        className="activity-item"
                        role="menuitem"
                        onClick={() => {
                          closeAll();
                          navigate(a.to);
                        }}
                      >
                        <span className={`activity-ico ${a.kind}`}>
                          <Icon name={a.kind === "quiz" ? "quiz" : "doc"} size={15} />
                        </span>
                        <span className="activity-body">
                          <span className="activity-title">{a.title}</span>
                          <span className="activity-sub">
                            {a.kind === "quiz" ? "Quiz taken" : "Document added"} ·{" "}
                            {formatRelative(a.at)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  className="menu-item view-all"
                  role="menuitem"
                  onClick={() => {
                    closeAll();
                    navigate("/analytics");
                  }}
                >
                  View analytics <Icon name="chevron" size={14} className="flip" />
                </button>
              </div>
            </>
          )}
        </div>

        <div className="nav-item-wrap">
          <button
            className="workspace-pill"
            aria-label="Switch workspace (Personal)"
            title="Workspace"
            onClick={() => {
              setWorkspaceOpen((o) => !o);
              if (!workspaceOpen) {
                setMenuOpen(false);
                setActivityOpen(false);
              }
            }}
          >
            <Icon name="layers" size={15} />
            <span className="workspace-name">Personal</span>
            <Icon name="chevronDown" size={14} />
          </button>
          {workspaceOpen && (
            <>
              <div className="menu-backdrop" onClick={closeAll} aria-hidden="true" />
              <div className="menu workspace-menu" role="menu">
                <div className="menu-head">
                  <div className="menu-name">Workspaces</div>
                </div>
                <div className="menu-item current">
                  <Icon name="layers" size={15} />
                  Personal
                  <Icon name="check" size={14} className="check" />
                </div>
                <div className="menu-item disabled" role="menuitem" aria-disabled="true">
                  <Icon name="plus" size={15} />
                  New workspace
                  <span className="soon">soon</span>
                </div>
              </div>
            </>
          )}
        </div>

        <ThemeToggle theme={theme} onToggle={onToggleTheme} />

        <div className="avatar-wrap">
          <button
            className="avatar avatar-btn"
            aria-label="Open profile menu"
            title={user?.full_name || user?.email || "Profile"}
            onClick={() => {
              setMenuOpen((o) => !o);
              if (!menuOpen) {
                setActivityOpen(false);
                setWorkspaceOpen(false);
              }
            }}
          >
            {user?.profile_image_url ? (
              <img src={user.profile_image_url} alt="" className="avatar-img" />
            ) : (
              initial
            )}
          </button>
          {menuOpen && (
            <>
              <div
                className="menu-backdrop"
                onClick={closeAll}
                aria-hidden="true"
              />
              <div className="menu" role="menu">
                <div className="menu-head">
                  <div className="menu-name">{user?.full_name}</div>
                  <div className="menu-email">{user?.email}</div>
                </div>
                <button
                  className="menu-item"
                  role="menuitem"
                  onClick={() => {
                    closeAll();
                    navigate("/profile");
                  }}
                >
                  <Icon name="grid" size={15} /> Profile
                </button>
                <button
                  className="menu-item danger"
                  role="menuitem"
                  onClick={() => void logout()}
                >
                  <Icon name="logout" size={15} /> Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

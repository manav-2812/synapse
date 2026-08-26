import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { STUDY_ITEMS, INSIGHTS_ITEMS } from "./nav";
import { Icon } from "../ui/Icon";
import { BrandLogo } from "../ui/BrandLogo";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../hooks/useTheme";
import { analyticsApi } from "../../api/analytics";
import { formatRelative } from "../../lib/format";
import { LogoutConfirmModal } from "../LogoutConfirmModal";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

const SEEN_KEY = "synapse_activity_seen";
const CLEARED_KEY = "synapse_activity_cleared";

interface ActivityItem {
  id: string;
  kind: "document" | "quiz" | "system";
  title: string;
  subtitle?: string;
  at: string;
  to: string;
}

type InboxFilter = "all" | "unread" | "quiz" | "document";

export function Sidebar({ collapsed, onToggle }: Props) {
  const { user, logout } = useAuth();
  const { themeMode, setThemeMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [inboxView, setInboxView] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const userSeenKey = user?.id ? `synapse_activity_seen_${user.id}` : SEEN_KEY;
  const userClearedKey = user?.id ? `synapse_activity_cleared_${user.id}` : CLEARED_KEY;

  const [clearedAt, setClearedAt] = useState<string>(() => {
    return localStorage.getItem(userClearedKey) || localStorage.getItem(CLEARED_KEY) || "";
  });
  const [seenAt, setSeenAt] = useState<string>(() => {
    const stored = localStorage.getItem(userSeenKey) || localStorage.getItem(SEEN_KEY);
    if (stored) return stored;
    const now = new Date().toISOString();
    localStorage.setItem(userSeenKey, now);
    return now;
  });

  // Sync keys when authenticated user changes
  useEffect(() => {
    if (!user?.id) return;
    const sKey = `synapse_activity_seen_${user.id}`;
    const cKey = `synapse_activity_cleared_${user.id}`;
    setClearedAt(localStorage.getItem(cKey) || "");
    const stored = localStorage.getItem(sKey);
    if (stored) {
      setSeenAt(stored);
    }
  }, [user?.id]);

  const loadDashboard = () => {
    analyticsApi
      .dashboard()
      .then((d) => {
        if (!d) return;
        const recentDocs = Array.isArray(d.recent_documents) ? d.recent_documents : [];
        const recentQuizzes = Array.isArray(d.recent_quizzes) ? d.recent_quizzes : [];
        const items: ActivityItem[] = [
          ...recentDocs.map((doc) => ({
            id: `doc:${doc.id}`,
            kind: "document" as const,
            title: doc.name,
            subtitle: "Document uploaded",
            at: doc.created_at,
            to: "/documents",
          })),
          ...recentQuizzes.map((q) => ({
            id: `quiz:${q.id}`,
            kind: "quiz" as const,
            title: q.title,
            subtitle: "Practice quiz completed",
            at: q.created_at,
            to: "/quiz",
          })),
        ].sort((a, b) => +new Date(b.at) - +new Date(a.at));
        setActivity(items);
      })
      .catch(() => {});
  };

  // Fetch real study telemetry & activity items on mount & user change
  useEffect(() => {
    loadDashboard();

    const onNewNotification = (e: Event) => {
      const detail = (e as CustomEvent).detail as ActivityItem;
      if (detail && detail.id) {
        setActivity((prev) => [detail, ...prev.filter((p) => p.id !== detail.id)]);
      }
    };

    window.addEventListener("synapse:new-notification", onNewNotification);
    window.addEventListener("synapse:refresh-activity", loadDashboard);

    return () => {
      window.removeEventListener("synapse:new-notification", onNewNotification);
      window.removeEventListener("synapse:refresh-activity", loadDashboard);
    };
  }, [user?.id]);

  // Filter out cleared items
  const activeActivity = useMemo(() => {
    if (!clearedAt) return activity;
    return activity.filter((a) => +new Date(a.at) > +new Date(clearedAt));
  }, [activity, clearedAt]);

  const unread = useMemo(
    () => activeActivity.filter((a) => +new Date(a.at) > +new Date(seenAt)).length,
    [activeActivity, seenAt]
  );

  const displayedActivity = useMemo(() => {
    if (inboxFilter === "unread") {
      return activeActivity.filter((a) => +new Date(a.at) > +new Date(seenAt));
    }
    if (inboxFilter === "quiz") {
      return activeActivity.filter((a) => a.kind === "quiz");
    }
    if (inboxFilter === "document") {
      return activeActivity.filter((a) => a.kind === "document");
    }
    return activeActivity;
  }, [activeActivity, inboxFilter, seenAt]);

  function markAllRead() {
    const now = new Date().toISOString();
    localStorage.setItem(userSeenKey, now);
    setSeenAt(now);
  }

  function handleClearAll() {
    const now = new Date().toISOString();
    localStorage.setItem(userClearedKey, now);
    setClearedAt(now);
    setFilterOpen(false);
  }

  function handleRestoreAll() {
    localStorage.removeItem(userClearedKey);
    localStorage.removeItem(CLEARED_KEY);
    setClearedAt("");
    loadDashboard();
  }

  function toggleInbox() {
    setInboxView((prev) => {
      const next = !prev;
      if (next) markAllRead();
      return next;
    });
    setFilterOpen(false);
  }

  async function handleLogout() {
    setLogoutBusy(true);
    try {
      await logout();
    } finally {
      setLogoutBusy(false);
      setLogoutOpen(false);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
        e.preventDefault();
        onToggle();
      }
      if (e.key === "Escape") {
        setFilterOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onToggle]);

  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent("synapse:command-palette"));
  }

  const initial = (user?.full_name || user?.email || "?").slice(0, 1).toUpperCase();
  const avatarSrc = user?.profile_image_url || null;
  const userSpaceTitle = user?.full_name
    ? `${user.full_name}'s Space`
    : "Manav Baghel's Space";

  if (collapsed) {
    return <aside className="sidebar sidebar-collapsed" aria-hidden="true" />;
  }

  const isChat = location.pathname.startsWith("/chat");
  const isSearch = location.pathname.startsWith("/search");

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      {/* ── Top: Brand header + Quick Actions ── */}
      <div className="sb-top">
        {/* Top brand row */}
        <div className="sb-brand-row">
          <div className="sb-brand-title">
            <span className="sb-ws-logo">
              <BrandLogo size={22} />
            </span>
            <span className="sb-brand-name">SYNAPSE</span>
          </div>

          <button
            className="sb-icon-btn sb-collapse-btn"
            onClick={onToggle}
            title="Close sidebar  Ctrl+\"
            aria-label="Close sidebar"
          >
            <Icon name="panelLeft" size={16} />
          </button>
        </div>

        {/* Quick action bar: Home / Chat / Inbox / Search */}
        <div className="sb-quick-bar">
          {/* Home Button / Pill */}
          {!inboxView && !isChat && !isSearch ? (
            <NavLink
              to="/dashboard"
              className="sb-quick-home active"
              title="Home"
              onClick={() => setInboxView(false)}
            >
              <Icon name="home" size={16} />
              <span>Home</span>
            </NavLink>
          ) : (
            <NavLink
              to="/dashboard"
              className="sb-quick-btn"
              title="Home"
              onClick={() => setInboxView(false)}
            >
              <Icon name="home" size={16} />
            </NavLink>
          )}

          {/* Chat Button / Pill */}
          {!inboxView && isChat ? (
            <NavLink
              to="/chat"
              className="sb-quick-home active"
              title="Chat"
              onClick={() => setInboxView(false)}
            >
              <Icon name="chat" size={16} />
              <span>Chat</span>
            </NavLink>
          ) : (
            <NavLink
              to="/chat"
              className="sb-quick-btn"
              title="Chat"
              onClick={() => setInboxView(false)}
            >
              <Icon name="chat" size={16} />
            </NavLink>
          )}

          {/* Inbox Button / Pill */}
          {inboxView ? (
            <button
              type="button"
              className="sb-quick-home active"
              title="Inbox"
              onClick={toggleInbox}
            >
              <Icon name="inbox" size={16} />
              <span>Inbox</span>
              {unread > 0 && <span className="sb-unread-dot">{unread}</span>}
            </button>
          ) : (
            <button
              type="button"
              className={`sb-quick-btn${unread > 0 ? " has-unread" : ""}`}
              aria-label="Notifications"
              title="Notifications"
              onClick={toggleInbox}
            >
              <Icon name="inbox" size={16} />
              {unread > 0 && (
                <span className="sb-unread-dot">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          )}

          {/* Search Button / Pill */}
          {!inboxView && isSearch ? (
            <button
              type="button"
              className="sb-quick-home active"
              title="Search (Ctrl+K)"
              aria-label="Search"
              onClick={() => {
                setInboxView(false);
                navigate("/search");
              }}
            >
              <Icon name="search" size={16} />
              <span>Search</span>
            </button>
          ) : (
            <button
              type="button"
              className={`sb-quick-btn${isSearch ? " active" : ""}`}
              title="Search (Ctrl+K)"
              aria-label="Search"
              onClick={() => {
                setInboxView(false);
                navigate("/search");
              }}
            >
              <Icon name="search" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Body: Contextual View (Inbox vs Normal Nav) ── */}
      {!collapsed && (
        <div className={`sb-body${inboxView ? " sb-body--inbox" : ""}`}>
          {inboxView ? (
            /* ── INBOX NOTIFICATIONS DIRECTLY IN SIDEBAR ── */
            <div className="sb-inbox-sidebar-view">
              <div className="sb-inbox-header-row">
                <div className="sb-inbox-header-title-wrap">
                  <span className="sb-inbox-section-title">
                    {inboxFilter === "unread"
                      ? "Unread"
                      : inboxFilter === "quiz"
                      ? "Quizzes"
                      : inboxFilter === "document"
                      ? "Documents"
                      : unread > 0
                      ? "Recent"
                      : "Older"}
                  </span>
                  <span className="sb-inbox-count-badge">
                    {displayedActivity.length}
                  </span>
                </div>

                <div className="sb-inbox-header-actions">
                  {/* Clear Inbox action */}
                  {displayedActivity.length > 0 && (
                    <button
                      type="button"
                      className="sb-inbox-tool-btn"
                      title="Clear notifications"
                      onClick={handleClearAll}
                      aria-label="Clear notifications"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  )}

                  {/* Mark all read action */}
                  {unread > 0 && (
                    <button
                      type="button"
                      className="sb-inbox-tool-btn"
                      title="Mark all as read"
                      onClick={markAllRead}
                      aria-label="Mark all as read"
                    >
                      <Icon name="check" size={13} />
                    </button>
                  )}

                  {/* Filter / Customization Toggle */}
                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      className={`sb-inbox-tool-btn${filterOpen ? " active" : ""}`}
                      title="Filter notifications"
                      onClick={() => setFilterOpen((o) => !o)}
                      aria-expanded={filterOpen}
                      aria-haspopup="true"
                      aria-label="Filter notifications"
                    >
                      <Icon name="sliders" size={13} />
                    </button>

                    {filterOpen && (
                      <>
                        <div
                          className="menu-backdrop"
                          onClick={() => setFilterOpen(false)}
                          aria-hidden="true"
                        />
                        <div className="sb-inbox-filter-popover" role="menu">
                          <div className="sb-filter-head">Filter Notifications</div>
                          <button
                            type="button"
                            className={`sb-filter-item${inboxFilter === "all" ? " active" : ""}`}
                            onClick={() => {
                              setInboxFilter("all");
                              setFilterOpen(false);
                            }}
                          >
                            <Icon name="inbox" size={13} />
                            <span>All</span>
                            <span className="sb-filter-count">{activeActivity.length}</span>
                          </button>
                          <button
                            type="button"
                            className={`sb-filter-item${inboxFilter === "unread" ? " active" : ""}`}
                            onClick={() => {
                              setInboxFilter("unread");
                              setFilterOpen(false);
                            }}
                          >
                            <Icon name="bell" size={13} />
                            <span>Unread</span>
                            <span className="sb-filter-count">{unread}</span>
                          </button>
                          <button
                            type="button"
                            className={`sb-filter-item${inboxFilter === "quiz" ? " active" : ""}`}
                            onClick={() => {
                              setInboxFilter("quiz");
                              setFilterOpen(false);
                            }}
                          >
                            <Icon name="quiz" size={13} />
                            <span>Quizzes</span>
                            <span className="sb-filter-count">
                              {activeActivity.filter((a) => a.kind === "quiz").length}
                            </span>
                          </button>
                          <button
                            type="button"
                            className={`sb-filter-item${inboxFilter === "document" ? " active" : ""}`}
                            onClick={() => {
                              setInboxFilter("document");
                              setFilterOpen(false);
                            }}
                          >
                            <Icon name="doc" size={13} />
                            <span>Documents</span>
                            <span className="sb-filter-count">
                              {activeActivity.filter((a) => a.kind === "document").length}
                            </span>
                          </button>

                          <div className="sb-filter-divider" />

                          <button
                            type="button"
                            className="sb-filter-item action"
                            onClick={handleClearAll}
                          >
                            <Icon name="trash" size={13} />
                            <span>Clear all notifications</span>
                          </button>
                          <button
                            type="button"
                            className="sb-filter-item action"
                            onClick={() => {
                              markAllRead();
                              setFilterOpen(false);
                            }}
                          >
                            <Icon name="check" size={13} />
                            <span>Mark all as read</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Feed items list (Scrollable) */}
              <div className="sb-inbox-list">
                {displayedActivity.length === 0 ? (
                  <div className="sb-inbox-empty">
                    <Icon name="inbox" size={26} />
                    <p>No notifications</p>
                    <span>
                      {inboxFilter !== "all"
                        ? "No matching notifications found."
                        : "All study activity is clear."}
                    </span>
                    {clearedAt && (
                      <button
                        type="button"
                        className="sb-inbox-restore-btn"
                        onClick={handleRestoreAll}
                      >
                        Restore past activities
                      </button>
                    )}
                  </div>
                ) : (
                  displayedActivity.map((item) => {
                    const isUnread = +new Date(item.at) > +new Date(seenAt);
                    const icon = item.kind === "quiz" ? "quiz" : "doc";

                    return (
                      <div
                        key={item.id}
                        className={`sb-inbox-card${isUnread ? " is-unread" : ""}`}
                        onClick={() => {
                          setInboxView(false);
                          navigate(item.to);
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="sb-inbox-card-left">
                          <span className="sb-inbox-card-icon">
                            <Icon name={icon} size={14} />
                          </span>
                        </div>

                        <div className="sb-inbox-card-content">
                          <div className="sb-inbox-card-header">
                            <span className="sb-inbox-card-title">
                              {item.kind === "quiz" ? "Quiz in " : "Doc in "}
                              <strong>{item.title}</strong>
                            </span>
                            <span className="sb-inbox-card-time">
                              {formatRelative(item.at)}
                            </span>
                          </div>

                          {item.subtitle && (
                            <span className="sb-inbox-card-sub">{item.subtitle}</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* ── NORMAL STUDY & INSIGHTS NAVIGATION ── */
            <>
              {/* Study Section */}
              <div className="sb-section">
                <span className="sb-section-label">Study</span>
                <nav className="sb-nav" aria-label="Study navigation">
                  {STUDY_ITEMS.map((it) => (
                    <NavLink
                      key={it.to}
                      to={it.to}
                      className={({ isActive }) => `sb-link${isActive ? " active" : ""}`}
                    >
                      <span className="sb-link-ico">
                        <Icon name={it.icon} size={16} />
                      </span>
                      <span className="sb-link-label">{it.label}</span>
                    </NavLink>
                  ))}
                </nav>
              </div>

              {/* Analytics & Eval Section */}
              <div className="sb-section">
                <span className="sb-section-label">Insights</span>
                <nav className="sb-nav" aria-label="Insights navigation">
                  {INSIGHTS_ITEMS.map((it) => (
                    <NavLink
                      key={it.to}
                      to={it.to}
                      className={({ isActive }) => `sb-link${isActive ? " active" : ""}`}
                    >
                      <span className="sb-link-ico">
                        <Icon name={it.icon} size={16} />
                      </span>
                      <span className="sb-link-label">{it.label}</span>
                    </NavLink>
                  ))}
                </nav>
              </div>

            </>
          )}
        </div>
      )}

      {/* ── Footer: Theme mode switcher + User profile pill ── */}
      {!collapsed && (
        <div className="sb-foot">
          {/* 3-Way Segmented Theme Toggle Pill */}
          <div className="sb-theme-wrap">
            <div className="sb-theme-segmented" role="radiogroup" aria-label="Theme mode switcher">
              <button
                type="button"
                className={`sb-theme-seg-btn ${themeMode === "light" ? "active" : ""}`}
                onClick={() => setThemeMode("light")}
                title="Light mode"
                aria-label="Light mode"
                aria-checked={themeMode === "light"}
                role="radio"
              >
                <Icon name="sun" size={14} />
              </button>
              <button
                type="button"
                className={`sb-theme-seg-btn ${themeMode === "system" ? "active" : ""}`}
                onClick={() => setThemeMode("system")}
                title="System preference"
                aria-label="System theme"
                aria-checked={themeMode === "system"}
                role="radio"
              >
                <Icon name="monitor" size={14} />
              </button>
              <button
                type="button"
                className={`sb-theme-seg-btn ${themeMode === "dark" ? "active" : ""}`}
                onClick={() => setThemeMode("dark")}
                title="Dark mode"
                aria-label="Dark mode"
                aria-checked={themeMode === "dark"}
                role="radio"
              >
                <Icon name="moon" size={14} />
              </button>
            </div>
          </div>

          {/* User Profile Pill */}
          <div className="sb-user-pill-wrap">
            <button
              className={`sb-user-pill-btn${profileOpen ? " sb-user-pill-btn--open" : ""}`}
              onClick={() => setProfileOpen((o) => !o)}
              aria-haspopup="true"
              aria-expanded={profileOpen}
              aria-label="User profile menu"
            >
              <div className="sb-user-avatar">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" className="sb-avatar-img" />
                ) : (
                  <span className="sb-avatar-initial">{initial}</span>
                )}
              </div>
              <span className="sb-user-name">{userSpaceTitle}</span>
              <span
                className="sb-user-chevron"
                style={{
                  transform: profileOpen ? "rotate(180deg)" : undefined,
                  transition: "transform 160ms ease",
                  display: "inline-flex",
                }}
              >
                <Icon name="chevronDown" size={13} />
              </span>
            </button>

            {profileOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setProfileOpen(false)} aria-hidden="true" />
                <div className="sb-profile-popover" role="menu">
                  <button
                    className="sb-profile-pop-item"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate("/profile");
                    }}
                  >
                    <span>Settings</span>
                  </button>
                  <button
                    className="sb-profile-pop-item"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false);
                      setLogoutOpen(true);
                    }}
                  >
                    <span>Log out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {logoutOpen && (
        <LogoutConfirmModal
          loading={logoutBusy}
          onConfirm={handleLogout}
          onCancel={() => setLogoutOpen(false)}
        />
      )}
    </aside>
  );
}

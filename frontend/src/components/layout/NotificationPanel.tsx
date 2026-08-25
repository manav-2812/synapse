import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { formatRelative } from "../../lib/format";

export interface ActivityItem {
  id: string;
  kind: "document" | "quiz" | "system";
  title: string;
  subtitle?: string;
  at: string;
  to: string;
}

interface Props {
  activity: ActivityItem[];
  seenAt: string;
  onMarkAllRead: () => void;
  onClose: () => void;
}

type TabFilter = "all" | "unread" | "document" | "quiz";

export function NotificationPanel({
  activity,
  seenAt,
  onMarkAllRead,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabFilter>("all");
  const [searchFilter, setSearchFilter] = useState("");

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const unreadItems = useMemo(
    () => activity.filter((a) => +new Date(a.at) > +new Date(seenAt)),
    [activity, seenAt]
  );

  const docCount = useMemo(
    () => activity.filter((a) => a.kind === "document").length,
    [activity]
  );

  const quizCount = useMemo(
    () => activity.filter((a) => a.kind === "quiz").length,
    [activity]
  );

  const displayedItems = useMemo(() => {
    let list = activity;
    if (tab === "unread") {
      list = unreadItems;
    } else if (tab === "document") {
      list = list.filter((a) => a.kind === "document");
    } else if (tab === "quiz") {
      list = list.filter((a) => a.kind === "quiz");
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.subtitle && a.subtitle.toLowerCase().includes(q))
      );
    }
    return list;
  }, [tab, unreadItems, activity, searchFilter]);

  return (
    <>
      <div className="menu-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="syn-inbox-panel" role="dialog" aria-label="Notifications Inbox">
        {/* Header */}
        <div className="syn-inbox-header">
          <div className="syn-inbox-header-left">
            <h2 className="syn-inbox-title">Workspace Inbox</h2>
            {unreadItems.length > 0 ? (
              <span className="syn-inbox-unread-pill">
                {unreadItems.length} new
              </span>
            ) : (
              <span className="syn-inbox-tab-count" style={{ fontSize: 11 }}>
                {activity.length} total
              </span>
            )}
          </div>

          <div className="syn-inbox-header-actions">
            {unreadItems.length > 0 && (
              <button
                type="button"
                className="syn-inbox-action-btn"
                title="Mark all as read"
                onClick={onMarkAllRead}
              >
                <Icon name="check" size={13} />
                <span>Mark read</span>
              </button>
            )}
            <button
              type="button"
              className="syn-inbox-close-btn"
              title="Close notifications"
              onClick={onClose}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="syn-inbox-tabs">
          <button
            type="button"
            className={`syn-inbox-tab${tab === "all" ? " active" : ""}`}
            onClick={() => setTab("all")}
          >
            <span>All</span>
            <span className="syn-inbox-tab-count">{activity.length}</span>
          </button>
          <button
            type="button"
            className={`syn-inbox-tab${tab === "unread" ? " active" : ""}`}
            onClick={() => setTab("unread")}
          >
            <span>Unread</span>
            {unreadItems.length > 0 && (
              <span className="syn-inbox-tab-badge">{unreadItems.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`syn-inbox-tab${tab === "document" ? " active" : ""}`}
            onClick={() => setTab("document")}
          >
            <span>Docs</span>
            <span className="syn-inbox-tab-count">{docCount}</span>
          </button>
          <button
            type="button"
            className={`syn-inbox-tab${tab === "quiz" ? " active" : ""}`}
            onClick={() => setTab("quiz")}
          >
            <span>Quizzes</span>
            <span className="syn-inbox-tab-count">{quizCount}</span>
          </button>
        </div>

        {/* Dedicated Pill Search Filter */}
        {activity.length > 3 && (
          <div className="syn-inbox-search-row">
            <div className="syn-inbox-search-wrap">
              <Icon name="search" size={13} className="syn-inbox-search-icon" />
              <input
                type="text"
                className="syn-inbox-search-input"
                placeholder="Filter notifications..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
              {searchFilter && (
                <button
                  type="button"
                  className="syn-inbox-search-clear"
                  onClick={() => setSearchFilter("")}
                  title="Clear filter"
                >
                  <Icon name="close" size={11} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Items List */}
        <div className="syn-inbox-body">
          {displayedItems.length === 0 ? (
            <div className="syn-inbox-empty">
              <div className="syn-inbox-empty-glyph">
                <Icon name="checkCircle" size={20} />
              </div>
              <h3 className="syn-inbox-empty-title">All Caught Up</h3>
              <p className="syn-inbox-empty-desc">
                {searchFilter
                  ? `No notifications matching "${searchFilter}".`
                  : tab === "unread"
                  ? "You have no unread notifications in your workspace."
                  : "No notifications recorded yet. Upload a document or take a quiz to get started."}
              </p>
            </div>
          ) : (
            <div className="syn-inbox-list">
              {displayedItems.map((item) => {
                const isUnread = +new Date(item.at) > +new Date(seenAt);
                return (
                  <div
                    key={item.id}
                    className={`syn-inbox-item${isUnread ? " unread" : ""}`}
                    onClick={() => {
                      onClose();
                      navigate(item.to);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onClose();
                        navigate(item.to);
                      }
                    }}
                  >
                    {isUnread && <div className="syn-inbox-unread-bar" />}

                    <div className={`syn-inbox-glyph ${item.kind}`}>
                      <Icon
                        name={item.kind === "quiz" ? "quiz" : "doc"}
                        size={15}
                      />
                    </div>

                    <div className="syn-inbox-item-content">
                      <div className="syn-inbox-item-top">
                        <span className="syn-inbox-item-title" title={item.title}>
                          {item.title}
                        </span>
                        <span className="syn-inbox-item-time">
                          {formatRelative(item.at)}
                        </span>
                      </div>
                      <span className="syn-inbox-item-sub">
                        {item.subtitle ||
                          (item.kind === "quiz"
                            ? "Practice quiz completed"
                            : "Document indexed and ready for study")}
                      </span>
                    </div>

                    <div className="syn-inbox-item-arrow">
                      <Icon name="chevronRight" size={13} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="syn-inbox-footer">
          <button
            type="button"
            className="syn-inbox-footer-link"
            onClick={() => {
              onClose();
              navigate("/analytics");
            }}
          >
            <span>View Detailed Analytics</span>
            <Icon name="chevronRight" size={12} />
          </button>
        </div>
      </div>
    </>
  );
}

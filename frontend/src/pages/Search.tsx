import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { documentsApi } from "../api/documents";
import { chatApi } from "../api/chat";
import { studyApi } from "../api/study";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";
import { Icon } from "../components/ui/Icon";
import { formatRelative, formatBytes } from "../lib/format";
import type {
  DocumentResponse,
  ConversationListItem,
  FlashcardResponse,
  QuizResponse,
  NoteResponse,
} from "../types/api";

type CategoryFilter = "all" | "documents" | "chats" | "notes" | "quizzes" | "flashcards" | "actions";
type SortOption = "relevance" | "recent" | "alpha";

interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  category: "Documents" | "Conversations" | "Notes" | "Quizzes" | "Flashcards" | "Actions";
  filterGroup: CategoryFilter;
  icon: string;
  tone: "emerald" | "purple" | "teal" | "amber" | "rose" | "blue" | "neutral";
  tag?: string;
  meta?: string;
  timestamp?: string;
  to: string;
  docId?: string;
  action?: () => void;
}

// Helper to highlight matching query text
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim() || !text) return <span>{text}</span>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="search-highlight">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
}

export default function Search() {
  const { user, logout } = useAuth();
  const { toggle } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Data state
  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [chats, setChats] = useState<ConversationListItem[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardResponse[]>([]);
  const [quizzes, setQuizzes] = useState<QuizResponse[]>([]);
  const [notes, setNotes] = useState<NoteResponse[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Load all workspace resources
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [docsRes, chatsRes, cardsRes, quizRes, notesRes] =
        await Promise.allSettled([
          documentsApi.list(),
          chatApi.listConversations(),
          studyApi.listFlashcards(),
          studyApi.listQuizzes(),
          studyApi.listNotes(),
        ]);

      if (docsRes.status === "fulfilled") setDocs(docsRes.value);
      if (chatsRes.status === "fulfilled") setChats(chatsRes.value);
      if (cardsRes.status === "fulfilled") setFlashcards(cardsRes.value);
      if (quizRes.status === "fulfilled") setQuizzes(quizRes.value);
      if (notesRes.status === "fulfilled") setNotes(notesRes.value);
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
    inputRef.current?.focus();
  }, [loadData]);

  // Update query in URL params smoothly
  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (val.trim()) {
      setSearchParams({ q: val.trim() }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  // Compile all search items
  const allItems = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = [];

    // Documents
    docs.forEach((d) => {
      const docName = d.original_filename || d.filename || "Document";
      items.push({
        id: `doc:${d.id}`,
        title: docName,
        subtitle: `${d.page_count || 1} page${d.page_count === 1 ? "" : "s"} · ${formatBytes(d.file_size_bytes)}`,
        category: "Documents",
        filterGroup: "documents",
        icon: "doc",
        tone: "neutral",
        tag: "Document",
        docId: d.id,
        meta: d.processing_status === "completed" ? "Indexed" : d.processing_status,
        timestamp: d.created_at,
        to: `/documents?doc=${d.id}`,
      });
    });

    // Chats
    chats.forEach((c) => {
      items.push({
        id: `chat:${c.id}`,
        title: c.title || "Untitled Conversation",
        subtitle: `${c.message_count || 0} messages in thread`,
        category: "Conversations",
        filterGroup: "chats",
        icon: "chat",
        tone: "neutral",
        tag: "Chat",
        timestamp: c.updated_at || c.created_at,
        to: `/chat?c=${c.id}`,
      });
    });

    // Notes
    notes.forEach((n) => {
      items.push({
        id: `note:${n.id}`,
        title: n.title || "Untitled Note",
        subtitle: n.content ? n.content.slice(0, 110).replace(/[#*_`]/g, "") : "Empty markdown note",
        category: "Notes",
        filterGroup: "notes",
        icon: "notes",
        tone: "neutral",
        tag: n.note_type ? n.note_type.replace(/_/g, " ") : "Note",
        timestamp: n.created_at,
        to: `/notes?id=${n.id}`,
      });
    });

    // Quizzes
    quizzes.forEach((q) => {
      items.push({
        id: `quiz:${q.id}`,
        title: q.title,
        subtitle: `${q.questions?.length || 0} questions · Difficulty: ${q.difficulty}`,
        category: "Quizzes",
        filterGroup: "quizzes",
        icon: "quiz",
        tone: "neutral",
        tag: "Quiz",
        timestamp: q.created_at,
        to: "/quiz",
      });
    });

    // Flashcards
    flashcards.forEach((f) => {
      items.push({
        id: `card:${f.id}`,
        title: f.front,
        subtitle: f.back ? `Back: ${f.back.slice(0, 90)}` : "Flashcard item",
        category: "Flashcards",
        filterGroup: "flashcards",
        icon: "card",
        tone: "neutral",
        tag: "Flashcard",
        timestamp: f.created_at,
        to: "/flashcards",
      });
    });

    // Actions & Navigation
    items.push(
      {
        id: "act:chat",
        title: "Ask AI Assistant",
        subtitle: "Global grounded synthesis and multi-document reasoning",
        category: "Actions",
        filterGroup: "actions",
        icon: "sparkles",
        tone: "neutral",
        tag: "AI Action",
        to: "/chat",
      },
      {
        id: "act:upload",
        title: "Upload & Ingest Document",
        subtitle: "Add PDF, DOCX, TXT or scanned images to your workspace",
        category: "Actions",
        filterGroup: "actions",
        icon: "upload",
        tone: "neutral",
        tag: "Upload",
        to: "/documents",
      },
      {
        id: "act:theme",
        title: "Toggle Theme Mode",
        subtitle: "Switch appearance between crisp light and dark aurora",
        category: "Actions",
        filterGroup: "actions",
        icon: "moon",
        tone: "neutral",
        tag: "Theme",
        to: "#",
        action: () => toggle(),
      },
      {
        id: "act:shortcuts",
        title: "Keyboard Shortcuts Reference",
        subtitle: "View comprehensive global hotkeys & quick navigation",
        category: "Actions",
        filterGroup: "actions",
        icon: "keyboard",
        tone: "neutral",
        tag: "Help",
        to: "#",
        action: () => window.dispatchEvent(new CustomEvent("synapse:shortcuts")),
      },
      {
        id: "act:profile",
        title: "Account Settings & Passkeys",
        subtitle: "Manage your credentials, WebAuthn passkeys and study goals",
        category: "Actions",
        filterGroup: "actions",
        icon: "user",
        tone: "neutral",
        tag: "Settings",
        to: "/profile",
      },
      {
        id: "act:logout",
        title: "Sign Out",
        subtitle: `Logged in as ${user?.email || "user"}`,
        category: "Actions",
        filterGroup: "actions",
        icon: "logout",
        tone: "neutral",
        tag: "Auth",
        to: "#",
        action: () => void logout(),
      }
    );

    return items;
  }, [docs, chats, notes, quizzes, flashcards, user, toggle, logout]);

  // Filtered and sorted results
  const filtered = useMemo(() => {
    let list = allItems;
    if (activeFilter !== "all") {
      list = list.filter((item) => item.filterGroup === activeFilter);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          (item.tag && item.tag.toLowerCase().includes(q)) ||
          item.category.toLowerCase().includes(q)
      );
    }

    // Sort
    return [...list].sort((a, b) => {
      if (sortBy === "recent" && a.timestamp && b.timestamp) {
        return +new Date(b.timestamp) - +new Date(a.timestamp);
      }
      if (sortBy === "alpha") {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });
  }, [allItems, query, activeFilter, sortBy]);

  // Keyboard navigation across items
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeFilter]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[selectedIndex];
      if (target) {
        if (target.action) {
          target.action();
        } else {
          navigate(target.to);
        }
      }
    }
  };

  // Group items by category and organize the display
  const categoryFilterMap: Record<string, CategoryFilter> = {
    Documents: "documents",
    Conversations: "chats",
    Notes: "notes",
    Quizzes: "quizzes",
    Flashcards: "flashcards",
    Actions: "actions",
  };

  const groupedResults = useMemo(() => {
    const map = new Map<string, SearchItem[]>();
    filtered.forEach((item) => {
      const group = map.get(item.category) || [];
      group.push(item);
      map.set(item.category, group);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="search-page-container" onKeyDown={handleKeyDown}>
      {/* ── Page Header ── */}
      <div className="search-page-header">
        <div className="search-page-title-wrap">
          <div className="search-page-icon-badge">
            <Icon name="search" size={24} />
          </div>
          <div>
            <h1 className="search-page-title">Search Workspace</h1>
            <p className="search-page-sub">
              Search across all documents, notes, conversations, flashcards, and actions in real time.
            </p>
          </div>
        </div>

        <div className="search-header-actions">
          <button
            type="button"
            className="search-header-refresh-btn"
            onClick={() => void loadData()}
            title="Refresh workspace index"
          >
            <Icon name="refresh" size={15} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* ── Massive Executive Search Input Bar ── */}
      <div className="search-hero-bar">
        <div className="search-hero-icon">
          <Icon name="search" size={22} />
        </div>
        <input
          ref={inputRef}
          type="text"
          className="search-hero-input"
          placeholder="Search documents, notes, chats, flashcards, or type keywords..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          autoComplete="off"
          spellCheck="false"
        />
        {query ? (
          <button
            type="button"
            className="search-hero-clear"
            onClick={() => handleQueryChange("")}
            title="Clear search"
          >
            <Icon name="close" size={14} />
          </button>
        ) : (
          <kbd className="search-hero-shortcut">⌘K</kbd>
        )}
        {loading && (
          <div className="search-hero-sync">
            <span className="search-hero-spinner" />
            <span>Syncing</span>
          </div>
        )}
        {query.trim() && (
          <button
            type="button"
            className="search-hero-ai-btn"
            onClick={() => navigate(`/chat?q=${encodeURIComponent(query.trim())}`)}
          >
            <Icon name="sparkles" size={15} />
            <span>Ask AI</span>
          </button>
        )}
      </div>

      {/* ── Filter Tabs & Controls Bar ── */}
      <div className="search-controls-bar">
        <div className="search-filter-pills">
          {[
            { id: "all" as const, label: "All Items", count: allItems.length },
            { id: "documents" as const, label: "Documents", count: docs.length },
            { id: "chats" as const, label: "Conversations", count: chats.length },
            { id: "notes" as const, label: "Notes", count: notes.length },
            { id: "quizzes" as const, label: "Quizzes", count: quizzes.length },
            { id: "flashcards" as const, label: "Flashcards", count: flashcards.length },
            { id: "actions" as const, label: "Actions" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`search-filter-pill${activeFilter === tab.id ? " active" : ""}`}
              onClick={() => setActiveFilter(tab.id)}
            >
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span className="search-filter-badge">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="search-sort-wrap">
          <label htmlFor="search-sort" className="search-sort-label">Sort by:</label>
          <select
            id="search-sort"
            className="search-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            <option value="relevance">Relevance</option>
            <option value="recent">Recently Updated</option>
            <option value="alpha">Alphabetical (A-Z)</option>
          </select>
        </div>
      </div>

      {/* ── Result Summary Strip ── */}
      <div className="search-stats-strip">
        <span className="search-stats-text">
          Showing <strong>{filtered.length}</strong> {filtered.length === 1 ? "result" : "results"}
          {activeFilter !== "all" && (
            <span> in <span className="search-stats-highlight">{activeFilter}</span></span>
          )}
        </span>
        {activeFilter !== "all" && (
          <button
            type="button"
            className="search-clear-filter-btn"
            onClick={() => setActiveFilter("all")}
          >
            <span>Show all categories</span>
            <Icon name="close" size={11} />
          </button>
        )}
      </div>

      {/* ── AI Synthesis Callout (If Query Present) ── */}
      {query.trim() && (
        <div className="search-ai-banner">
          <div className="search-ai-banner-content">
            <div className="search-ai-banner-icon">
              <Icon name="sparkles" size={22} />
            </div>
            <div>
              <h3 className="search-ai-banner-title">
                Synthesize answers for &ldquo;{query.trim()}&rdquo; with AI
              </h3>
              <p className="search-ai-banner-desc">
                Generate grounded multi-document answers, extracts, and citation-backed synthesis from your entire library.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="search-ai-banner-cta"
            onClick={() => navigate(`/chat?q=${encodeURIComponent(query.trim())}`)}
          >
            <span>Open in AI Chat</span>
            <Icon name="chevronRight" size={15} />
          </button>
        </div>
      )}

      {/* ── Results Container ── */}
      <div className="search-results-container">
        {loading && allItems.length === 0 ? (
          <div className="search-skeleton-grid">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="search-skeleton-card">
                <div className="search-skeleton-icon" />
                <div className="search-skeleton-content">
                  <div className="search-skeleton-title" />
                  <div className="search-skeleton-sub" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="search-empty-card">
            <div className="search-empty-icon">
              <Icon name="search" size={32} />
            </div>
            <h2 className="search-empty-title">
              No results found for &ldquo;{query}&rdquo;
            </h2>
            <p className="search-empty-sub">
              Try searching with different keywords, check your spelling, or launch a direct AI query across your documents.
            </p>
            {query.trim() && (
              <button
                type="button"
                className="search-empty-action"
                onClick={() => navigate(`/chat?q=${encodeURIComponent(query.trim())}`)}
              >
                <Icon name="sparkles" size={16} />
                <span>Ask AI Assistant about &ldquo;{query.trim()}&rdquo;</span>
              </button>
            )}
          </div>
        ) : (
          <div className="search-groups-list">
            {groupedResults.map(([category, items]) => {
              // In "all" mode without search query, show top 6 per section for crisp organization
              const isAllView = activeFilter === "all" && !query.trim();
              const displayItems = isAllView ? items.slice(0, 6) : items;
              const hasMore = isAllView && items.length > 6;
              const targetFilter = categoryFilterMap[category] || "all";

              return (
                <div key={category} className="search-category-group">
                  <div className="search-category-header">
                    <div className="search-category-title-wrap">
                      <span className="search-category-title">{category}</span>
                      <span className="search-category-count">{items.length}</span>
                    </div>

                    <span className="search-category-line" />

                    {hasMore && (
                      <button
                        type="button"
                        className="search-category-view-all"
                        onClick={() => setActiveFilter(targetFilter)}
                      >
                        <span>View all {items.length}</span>
                        <Icon name="chevronRight" size={13} />
                      </button>
                    )}
                  </div>

                  <div className="search-items-grid">
                    {displayItems.map((item) => {
                      const isGlobalActive = filtered.indexOf(item) === selectedIndex;
                      return (
                        <div
                          key={item.id}
                          className={`search-result-card${isGlobalActive ? " active" : ""}`}
                          onClick={() => {
                            if (item.action) {
                              item.action();
                            } else {
                              navigate(item.to);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className={`search-result-glyph ${item.tone}`}>
                            <Icon name={item.icon} size={18} />
                          </div>

                          <div className="search-result-body">
                            <h3 className="search-result-title" title={item.title}>
                              <HighlightText text={item.title} query={query} />
                            </h3>

                            <p className="search-result-sub">
                              <HighlightText text={item.subtitle} query={query} />
                            </p>

                            <div className="search-result-meta-row">
                              {item.meta && (
                                <span className="search-result-meta-badge">
                                  <span className="search-meta-dot" />
                                  {item.meta}
                                </span>
                              )}
                              {item.timestamp && (
                                <span className="search-result-timestamp">
                                  {formatRelative(item.timestamp)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="search-result-action">
                            {item.docId && (
                              <button
                                type="button"
                                className="search-card-ai-btn"
                                title="Ask AI about this document"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/chat?doc=${item.docId}`);
                                }}
                              >
                                <Icon name="sparkles" size={12} />
                                <span>Ask AI</span>
                              </button>
                            )}
                            <span className="search-card-arrow">
                              <Icon name="chevronRight" size={15} />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

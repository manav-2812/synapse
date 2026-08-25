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
type DateFilter = "all" | "24h" | "7d" | "30d";
type GroupByOption = "category" | "none";
type DensityOption = "normal" | "compact";

interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  category: "Documents" | "Conversations" | "Notes" | "Quizzes" | "Flashcards" | "Actions";
  filterGroup: CategoryFilter;
  icon: string;
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
          <mark key={i} className="linear-highlight">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
}

// Pixel-perfect Linear Empty State with icon constellation & center floating search badge
function SearchEmptyState({
  hasQuery,
  query,
  onClear,
}: {
  hasQuery: boolean;
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="linear-search-empty">
      <div className="linear-icon-cloud-wrap" aria-hidden="true">
        <div className="linear-icon-cloud-grid">
          {/* Row 1 */}
          <div className="linear-cloud-icon c-1"><Icon name="box" size={13} /></div>
          <div className="linear-cloud-icon c-2"><Icon name="user" size={13} /></div>
          <div className="linear-cloud-icon c-3"><Icon name="chat" size={13} /></div>
          <div className="linear-cloud-icon c-4"><Icon name="moon" size={13} /></div>
          <div className="linear-cloud-icon c-5"><Icon name="filter" size={13} /></div>
          <div className="linear-cloud-icon c-6"><Icon name="sparkles" size={13} /></div>

          {/* Row 2 */}
          <div className="linear-cloud-icon c-7"><Icon name="trash" size={13} /></div>
          <div className="linear-cloud-icon c-8"><Icon name="globe" size={13} /></div>
          <div className="linear-cloud-icon placeholder" />
          <div className="linear-cloud-icon placeholder" />
          <div className="linear-cloud-icon c-9"><Icon name="chart" size={13} /></div>
          <div className="linear-cloud-icon c-10"><Icon name="target" size={13} /></div>

          {/* Row 3 */}
          <div className="linear-cloud-icon c-11"><Icon name="bell" size={13} /></div>
          <div className="linear-cloud-icon c-12"><Icon name="card" size={13} /></div>
          <div className="linear-cloud-icon c-13"><Icon name="grid" size={13} /></div>
          <div className="linear-cloud-icon c-14"><Icon name="doc" size={13} /></div>
          <div className="linear-cloud-icon c-15"><Icon name="key" size={13} /></div>
          <div className="linear-cloud-icon c-16"><Icon name="pin" size={13} /></div>
        </div>

        {/* Center Floating Glass Card */}
        <div className="linear-center-card">
          <Icon name="search" size={20} />
        </div>
      </div>

      <h2 className="linear-empty-title">Search</h2>
      <p className="linear-empty-desc">
        {hasQuery
          ? `No results found for "${query}". Try searching with different keywords.`
          : "Find documents, notes, chats, quizzes, flashcards, and actions"}
      </p>

      {hasQuery && (
        <button type="button" className="linear-empty-clear-btn" onClick={onClear}>
          <Icon name="close" size={12} />
          <span>Clear search</span>
        </button>
      )}
    </div>
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
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [groupBy, setGroupBy] = useState<GroupByOption>("category");
  const [density, setDensity] = useState<DensityOption>("normal");
  const [showSnippets, setShowSnippets] = useState<boolean>(true);
  const [showTimestamps, setShowTimestamps] = useState<boolean>(true);

  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Popover open states
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);

  // Data state
  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [chats, setChats] = useState<ConversationListItem[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardResponse[]>([]);
  const [quizzes, setQuizzes] = useState<QuizResponse[]>([]);
  const [notes, setNotes] = useState<NoteResponse[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const viewOptionsRef = useRef<HTMLDivElement>(null);

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

  // Close popovers on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
      if (viewOptionsRef.current && !viewOptionsRef.current.contains(e.target as Node)) {
        setViewOptionsOpen(false);
      }
    }
    if (filterOpen || viewOptionsOpen) {
      document.addEventListener("mousedown", handleOutside);
      return () => document.removeEventListener("mousedown", handleOutside);
    }
  }, [filterOpen, viewOptionsOpen]);

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

    docs.forEach((d) => {
      const docName = d.original_filename || d.filename || "Document";
      items.push({
        id: `doc:${d.id}`,
        title: docName,
        subtitle: `${d.page_count || 1} page${d.page_count === 1 ? "" : "s"} · ${formatBytes(d.file_size_bytes)}`,
        category: "Documents",
        filterGroup: "documents",
        icon: "doc",
        tag: "Document",
        docId: d.id,
        meta: d.processing_status === "completed" ? "Indexed" : d.processing_status,
        timestamp: d.created_at,
        to: `/documents?doc=${d.id}`,
      });
    });

    chats.forEach((c) => {
      items.push({
        id: `chat:${c.id}`,
        title: c.title || "Untitled Conversation",
        subtitle: `${c.message_count || 0} messages`,
        category: "Conversations",
        filterGroup: "chats",
        icon: "chat",
        tag: "Chat",
        timestamp: c.updated_at || c.created_at,
        to: `/chat?c=${c.id}`,
      });
    });

    notes.forEach((n) => {
      items.push({
        id: `note:${n.id}`,
        title: n.title || "Untitled Note",
        subtitle: n.content ? n.content.slice(0, 110).replace(/[#*_`]/g, "") : "Empty note",
        category: "Notes",
        filterGroup: "notes",
        icon: "notes",
        tag: n.note_type ? n.note_type.replace(/_/g, " ") : "Note",
        timestamp: n.created_at,
        to: `/notes?id=${n.id}`,
      });
    });

    quizzes.forEach((q) => {
      items.push({
        id: `quiz:${q.id}`,
        title: q.title,
        subtitle: `${q.questions?.length || 0} questions · ${q.difficulty}`,
        category: "Quizzes",
        filterGroup: "quizzes",
        icon: "quiz",
        tag: "Quiz",
        timestamp: q.created_at,
        to: "/quiz",
      });
    });

    flashcards.forEach((f) => {
      items.push({
        id: `card:${f.id}`,
        title: f.front,
        subtitle: f.back ? `Back: ${f.back.slice(0, 90)}` : "Flashcard",
        category: "Flashcards",
        filterGroup: "flashcards",
        icon: "card",
        tag: "Flashcard",
        timestamp: f.created_at,
        to: "/flashcards",
      });
    });

    items.push(
      {
        id: "act:chat",
        title: "Ask AI Assistant",
        subtitle: "Grounded synthesis and reasoning across all sources",
        category: "Actions",
        filterGroup: "actions",
        icon: "sparkles",
        tag: "AI",
        to: "/chat",
      },
      {
        id: "act:upload",
        title: "Upload Document",
        subtitle: "Add PDF, DOCX, TXT or scanned images",
        category: "Actions",
        filterGroup: "actions",
        icon: "upload",
        tag: "Upload",
        to: "/documents",
      },
      {
        id: "act:theme",
        title: "Toggle Theme",
        subtitle: "Switch between light and dark mode",
        category: "Actions",
        filterGroup: "actions",
        icon: "moon",
        tag: "Theme",
        to: "#",
        action: () => toggle(),
      },
      {
        id: "act:profile",
        title: "Account Settings",
        subtitle: "Manage credentials and passkeys",
        category: "Actions",
        filterGroup: "actions",
        icon: "key",
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
        tag: "Auth",
        to: "#",
        action: () => void logout(),
      }
    );

    return items;
  }, [docs, chats, notes, quizzes, flashcards, user, toggle, logout]);

  // Filtered + sorted + date filtered
  const filtered = useMemo(() => {
    let list = allItems;
    if (activeFilter !== "all") {
      list = list.filter((item) => item.filterGroup === activeFilter);
    }

    // Date filter
    if (dateFilter !== "all") {
      const now = Date.now();
      const cutoff =
        dateFilter === "24h"
          ? 24 * 60 * 60 * 1000
          : dateFilter === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;

      list = list.filter((item) => {
        if (!item.timestamp) return true;
        const diff = now - new Date(item.timestamp).getTime();
        return diff <= cutoff;
      });
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

    return [...list].sort((a, b) => {
      if (sortBy === "recent" && a.timestamp && b.timestamp) {
        return +new Date(b.timestamp) - +new Date(a.timestamp);
      }
      if (sortBy === "alpha") return a.title.localeCompare(b.title);
      return 0;
    });
  }, [allItems, query, activeFilter, sortBy, dateFilter]);

  // ⌘K focuses input
  useEffect(() => {
    const handleGlobal = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleGlobal);
    return () => window.removeEventListener("keydown", handleGlobal);
  }, []);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [query, activeFilter, dateFilter, sortBy]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // If the Enter key is pressed while focused in the search input, do not navigate away
    if (e.target instanceof HTMLInputElement && e.key === "Enter") {
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      const target = filtered[selectedIndex];
      if (target) {
        if (target.action) target.action();
        else navigate(target.to);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (filterOpen) setFilterOpen(false);
      else if (viewOptionsOpen) setViewOptionsOpen(false);
      else if (query) handleQueryChange("");
      else inputRef.current?.blur();
    }
  };

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

  const showEmpty = !loading && (!query.trim() && activeFilter === "all" && dateFilter === "all" ? true : filtered.length === 0);
  const showResults = !loading && (query.trim() || activeFilter !== "all" || dateFilter !== "all") && filtered.length > 0;

  const FILTER_TABS = [
    { id: "all" as const, label: "All", count: null },
    { id: "documents" as const, label: "Documents", count: docs.length },
    { id: "chats" as const, label: "Chats", count: chats.length },
    { id: "notes" as const, label: "Notes", count: notes.length },
    { id: "quizzes" as const, label: "Quizzes", count: quizzes.length },
    { id: "flashcards" as const, label: "Flashcards", count: flashcards.length },
    { id: "actions" as const, label: "Actions", count: null },
  ];

  return (
    <div className={`linear-search-page ${density === "compact" ? "linear-density--compact" : ""}`} onKeyDown={handleKeyDown}>
      {/* ── Top Bar: Clean Linear Input & Controls ── */}
      <div className="linear-search-topbar">
        {/* Line 1: Borderless seamless input */}
        <div className="linear-search-input-line">
          <span className="linear-search-icon">
            {loading ? (
              <span className="linear-spinner" />
            ) : (
              <Icon name="search" size={16} />
            )}
          </span>
          <input
            ref={inputRef}
            type="text"
            className="linear-search-input"
            placeholder="Search documents, notes, chats, flashcards, and actions..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                // Stay on search page, do not navigate away
                e.currentTarget.blur();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex(0);
              }
            }}
            autoComplete="off"
            spellCheck="false"
            aria-label="Search workspace"
          />
          {query ? (
            <button
              type="button"
              className="linear-search-clear"
              onClick={() => handleQueryChange("")}
              title="Clear search (Esc)"
            >
              <Icon name="close" size={12} />
            </button>
          ) : (
            <span className="linear-input-shortcut" title="Focus search">
              ⌘K
            </span>
          )}
        </div>

        {/* Line 2: Filter Pills & Action Icons */}
        <div className="linear-search-controls-row">
          <div className="linear-search-pills">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`linear-filter-pill${activeFilter === tab.id ? " active" : ""}`}
                onClick={() => setActiveFilter(tab.id)}
              >
                <span>{tab.label}</span>
                {tab.count !== null && tab.count > 0 && (
                  <span className="linear-filter-badge">{tab.count}</span>
                )}
              </button>
            ))}

            {/* AI Shortcut Button if query present */}
            {query.trim() && (
              <button
                type="button"
                className="linear-ai-pill"
                onClick={() => navigate(`/chat?q=${encodeURIComponent(query.trim())}`)}
              >
                <Icon name="sparkles" size={12} />
                <span>Ask AI</span>
              </button>
            )}
          </div>

          <div className="linear-search-actions">
            {/* Filter by Date Button */}
            <div className="linear-action-wrap" ref={filterRef}>
              <button
                type="button"
                className={`linear-circle-btn${filterOpen || dateFilter !== "all" ? " active" : ""}`}
                onClick={() => {
                  setFilterOpen(!filterOpen);
                  setViewOptionsOpen(false);
                }}
                title="Filter options"
              >
                <Icon name="filter" size={13} />
              </button>
              {filterOpen && (
                <div className="linear-dropdown-menu">
                  <div className="linear-dropdown-header">Filter by Date</div>
                  {(["all", "24h", "7d", "30d"] as DateFilter[]).map((df) => (
                    <button
                      key={df}
                      type="button"
                      className={`linear-dropdown-item${dateFilter === df ? " active" : ""}`}
                      onClick={() => {
                        setDateFilter(df);
                        setFilterOpen(false);
                      }}
                    >
                      {dateFilter === df && <Icon name="check" size={12} />}
                      <span>
                        {df === "all"
                          ? "All Time"
                          : df === "24h"
                          ? "Past 24 Hours"
                          : df === "7d"
                          ? "Past 7 Days"
                          : "Past 30 Days"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* View Options Popover Button */}
            <div className="linear-action-wrap" ref={viewOptionsRef}>
              <button
                type="button"
                className={`linear-circle-btn${viewOptionsOpen ? " active" : ""}`}
                title="View options"
                onClick={() => {
                  setViewOptionsOpen(!viewOptionsOpen);
                  setFilterOpen(false);
                }}
              >
                <Icon name="sliders" size={13} />
              </button>
              {viewOptionsOpen && (
                <div className="linear-view-popover">
                  <div className="linear-view-popover-header">
                    <span>View Options</span>
                    <button
                      type="button"
                      className="linear-view-popover-close"
                      onClick={() => setViewOptionsOpen(false)}
                      title="Close view options"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>

                  {/* Grouping */}
                  <div className="linear-view-section">
                    <div className="linear-view-section-label">Grouping</div>
                    <div className="linear-view-segmented">
                      <button
                        type="button"
                        className={`linear-segmented-btn${groupBy === "category" ? " active" : ""}`}
                        onClick={() => setGroupBy("category")}
                      >
                        Category
                      </button>
                      <button
                        type="button"
                        className={`linear-segmented-btn${groupBy === "none" ? " active" : ""}`}
                        onClick={() => setGroupBy("none")}
                      >
                        Flat List
                      </button>
                    </div>
                  </div>

                  {/* Sort By */}
                  <div className="linear-view-section">
                    <div className="linear-view-section-label">Sort By</div>
                    <div className="linear-view-segmented">
                      <button
                        type="button"
                        className={`linear-segmented-btn${sortBy === "relevance" ? " active" : ""}`}
                        onClick={() => setSortBy("relevance")}
                      >
                        Relevance
                      </button>
                      <button
                        type="button"
                        className={`linear-segmented-btn${sortBy === "recent" ? " active" : ""}`}
                        onClick={() => setSortBy("recent")}
                      >
                        Recent
                      </button>
                      <button
                        type="button"
                        className={`linear-segmented-btn${sortBy === "alpha" ? " active" : ""}`}
                        onClick={() => setSortBy("alpha")}
                      >
                        A–Z
                      </button>
                    </div>
                  </div>

                  {/* Density */}
                  <div className="linear-view-section">
                    <div className="linear-view-section-label">Density</div>
                    <div className="linear-view-segmented">
                      <button
                        type="button"
                        className={`linear-segmented-btn${density === "normal" ? " active" : ""}`}
                        onClick={() => setDensity("normal")}
                      >
                        Normal
                      </button>
                      <button
                        type="button"
                        className={`linear-segmented-btn${density === "compact" ? " active" : ""}`}
                        onClick={() => setDensity("compact")}
                      >
                        Compact
                      </button>
                    </div>
                  </div>

                  {/* Display Toggles */}
                  <div className="linear-view-section">
                    <div className="linear-view-section-label">Display</div>
                    <label className="linear-view-toggle-item">
                      <span>Show snippets & previews</span>
                      <input
                        type="checkbox"
                        checked={showSnippets}
                        onChange={(e) => setShowSnippets(e.target.checked)}
                      />
                    </label>
                    <label className="linear-view-toggle-item">
                      <span>Show timestamps</span>
                      <input
                        type="checkbox"
                        checked={showTimestamps}
                        onChange={(e) => setShowTimestamps(e.target.checked)}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content Area ── */}
      <div className="linear-search-body">
        {loading && allItems.length === 0 ? (
          /* Skeleton */
          <div className="linear-skeleton-list">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="linear-skeleton-row">
                <div className="linear-skeleton-glyph" />
                <div className="linear-skeleton-text">
                  <div className="linear-skeleton-title" />
                  <div className="linear-skeleton-sub" />
                </div>
              </div>
            ))}
          </div>
        ) : showEmpty ? (
          <SearchEmptyState
            hasQuery={!!query.trim()}
            query={query}
            onClear={() => handleQueryChange("")}
          />
        ) : showResults ? (
          <div className="linear-groups">
            {groupBy === "category" ? (
              groupedResults.map(([category, items]) => {
                const isAllView = activeFilter === "all" && !query.trim() && dateFilter === "all";
                const displayItems = isAllView ? items.slice(0, 8) : items;
                const hasMore = isAllView && items.length > 8;
                const targetFilter = categoryFilterMap[category] || "all";

                return (
                  <div key={category} className="linear-group">
                    {/* Group header */}
                    <div className="linear-group-header">
                      <span className="linear-group-label">{category}</span>
                      <span className="linear-group-count">{items.length}</span>
                      {hasMore && (
                        <button
                          type="button"
                          className="linear-group-view-all"
                          onClick={() => setActiveFilter(targetFilter)}
                        >
                          View all {items.length}
                          <Icon name="chevronRight" size={12} />
                        </button>
                      )}
                    </div>

                    {/* Rows */}
                    <div className="linear-rows">
                      {displayItems.map((item) => {
                        const isActive = selectedIndex >= 0 && filtered.indexOf(item) === selectedIndex;
                        const glyphCategoryClass = `linear-glyph--${item.category.toLowerCase()}`;

                        return (
                          <div
                            key={item.id}
                            className={`linear-row${isActive ? " linear-row--active" : ""}`}
                            onClick={() => {
                              if (item.action) item.action();
                              else navigate(item.to);
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                if (item.action) item.action();
                                else navigate(item.to);
                              }
                            }}
                          >
                            {/* Glyph */}
                            <div className={`linear-row-glyph ${glyphCategoryClass}`}>
                              <Icon name={item.icon} size={14} />
                            </div>

                            {/* Content */}
                            <div className="linear-row-content">
                              <span className="linear-row-title">
                                <HighlightText text={item.title} query={query} />
                              </span>
                              {showSnippets && (
                                <span className="linear-row-sub">
                                  <HighlightText text={item.subtitle} query={query} />
                                </span>
                              )}
                            </div>

                            {/* Right side info */}
                            <div className="linear-row-right">
                              {item.tag && (
                                <span className={`linear-row-tag linear-tag--${item.category.toLowerCase()}`}>
                                  {item.tag}
                                </span>
                              )}
                              {showTimestamps && item.timestamp && (
                                <span className="linear-row-time">{formatRelative(item.timestamp)}</span>
                              )}
                              {item.docId && (
                                <button
                                  type="button"
                                  className="linear-row-ai-btn"
                                  title="Ask AI about this document"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/chat?doc=${item.docId}`);
                                  }}
                                >
                                  <Icon name="sparkles" size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              /* Flat list */
              <div className="linear-rows">
                {filtered.map((item) => {
                  const isActive = selectedIndex >= 0 && filtered.indexOf(item) === selectedIndex;
                  const glyphCategoryClass = `linear-glyph--${item.category.toLowerCase()}`;

                  return (
                    <div
                      key={item.id}
                      className={`linear-row${isActive ? " linear-row--active" : ""}`}
                      onClick={() => {
                        if (item.action) item.action();
                        else navigate(item.to);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (item.action) item.action();
                          else navigate(item.to);
                        }
                      }}
                    >
                      <div className={`linear-row-glyph ${glyphCategoryClass}`}>
                        <Icon name={item.icon} size={14} />
                      </div>
                      <div className="linear-row-content">
                        <span className="linear-row-title">
                          <HighlightText text={item.title} query={query} />
                        </span>
                        {showSnippets && (
                          <span className="linear-row-sub">
                            <HighlightText text={item.subtitle} query={query} />
                          </span>
                        )}
                      </div>
                      <div className="linear-row-right">
                        {item.tag && (
                          <span className={`linear-row-tag linear-tag--${item.category.toLowerCase()}`}>
                            {item.tag}
                          </span>
                        )}
                        {showTimestamps && item.timestamp && (
                          <span className="linear-row-time">{formatRelative(item.timestamp)}</span>
                        )}
                        {item.docId && (
                          <button
                            type="button"
                            className="linear-row-ai-btn"
                            title="Ask AI about this document"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/chat?doc=${item.docId}`);
                            }}
                          >
                            <Icon name="sparkles" size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

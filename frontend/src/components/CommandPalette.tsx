import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";
import { documentsApi } from "../api/documents";
import { chatApi } from "../api/chat";
import { studyApi } from "../api/study";
import { Icon } from "./ui/Icon";
import { BrandLogo } from "./ui/BrandLogo";
import type {
  DocumentResponse,
  ConversationListItem,
  FlashcardResponse,
  QuizResponse,
  NoteResponse,
} from "../types/api";

type CategoryFilter = "all" | "actions" | "documents" | "chats" | "study" | "notes";

interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  category: "AI & Actions" | "Documents" | "Recent Chats" | "Study Tools" | "Notes" | "Navigation";
  filterGroup: CategoryFilter;
  icon: string;
  tone?: "blue" | "purple" | "emerald" | "amber" | "rose" | "teal" | "neutral";
  badge?: string;
  hint?: string;
  meta?: string;
  run: () => void;
}

export function CommandPalette() {
  const { logout, user } = useAuth();
  const { toggle } = useTheme();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>("all");
  const [active, setActive] = useState(0);
  const [loadingData, setLoadingData] = useState(false);

  // Workspace resources
  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [chats, setChats] = useState<ConversationListItem[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardResponse[]>([]);
  const [quizzes, setQuizzes] = useState<QuizResponse[]>([]);
  const [notes, setNotes] = useState<NoteResponse[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch live workspace data on open
  const loadWorkspaceData = useCallback(async () => {
    if (!user) return;
    setLoadingData(true);
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
      // Non-blocking fallback
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) {
      void loadWorkspaceData();
    }
  }, [open, loadWorkspaceData]);

  // Build the complete command catalogue
  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];
    const q = query.trim().toLowerCase();

    // 1. AI Actions
    if (q) {
      items.push({
        id: "action:ask-query",
        title: `Ask AI: "${query.trim()}"`,
        subtitle: "Start an intelligent reasoning conversation on this topic",
        category: "AI & Actions",
        filterGroup: "actions",
        icon: "sparkles",
        tone: "blue",
        badge: "AI Synthesis",
        hint: "↵ ask",
        run: () => navigate(`/chat?q=${encodeURIComponent(query.trim())}`),
      });
    } else {
      items.push({
        id: "action:ask-ai",
        title: "Ask AI Assistant",
        subtitle: "Global semantic search & grounded synthesis across all sources",
        category: "AI & Actions",
        filterGroup: "actions",
        icon: "sparkles",
        tone: "blue",
        hint: "chat",
        badge: "Neural Core",
        run: () => navigate("/chat"),
      });
    }

    items.push(
      {
        id: "action:upload",
        title: "Upload & Ingest Document",
        subtitle: "Support for PDF, DOCX, TXT, OCR Scans & Images",
        category: "AI & Actions",
        filterGroup: "actions",
        icon: "upload",
        tone: "blue",
        badge: "Ingestion",
        run: () => navigate("/documents"),
      },
      {
        id: "action:theme",
        title: "Toggle Theme Mode",
        subtitle: "Switch between crisp light canvas and dark aurora",
        category: "AI & Actions",
        filterGroup: "actions",
        icon: "moon",
        tone: "purple",
        badge: "Appearance",
        run: () => toggle(),
      },
      {
        id: "action:shortcuts",
        title: "Keyboard Shortcuts Reference",
        subtitle: "View comprehensive global hotkeys & quick actions",
        category: "AI & Actions",
        filterGroup: "actions",
        hint: "?",
        icon: "keyboard",
        tone: "neutral",
        badge: "Shortcuts",
        run: () => window.dispatchEvent(new CustomEvent("synapse:shortcuts")),
      },
      {
        id: "action:logout",
        title: "Sign Out",
        subtitle: `Logged in as ${user?.email || "user"}`,
        category: "AI & Actions",
        filterGroup: "actions",
        icon: "logout",
        tone: "rose",
        badge: "Security",
        run: () => void logout(),
      }
    );

    // 2. Documents
    docs.forEach((d) => {
      const docName = d.original_filename || d.filename || "Document";
      items.push({
        id: `doc:${d.id}`,
        title: docName,
        subtitle: `${d.page_count || 1} page(s) · Size: ${(d.file_size_bytes / 1024).toFixed(0)} KB`,
        category: "Documents",
        filterGroup: "documents",
        icon: "doc",
        tone: "emerald",
        badge: "Document",
        meta: d.processing_status === "completed" ? "Indexed" : d.processing_status,
        run: () => navigate(`/documents?doc=${d.id}`),
      });
    });

    // 3. Recent Chats
    chats.forEach((c) => {
      items.push({
        id: `chat:${c.id}`,
        title: c.title || "Untitled conversation",
        subtitle: `${c.message_count || 0} messages in thread`,
        category: "Recent Chats",
        filterGroup: "chats",
        icon: "chat",
        tone: "purple",
        badge: "Chat",
        run: () => navigate(`/chat?c=${c.id}`),
      });
    });

    // 4. Study Tools (Flashcards & Quizzes)
    flashcards.forEach((f) => {
      items.push({
        id: `fc:${f.id}`,
        title: f.front,
        subtitle: f.back ? `Answer: ${f.back.slice(0, 70)}...` : "Flashcard prompt",
        category: "Study Tools",
        filterGroup: "study",
        icon: "card",
        tone: "rose",
        badge: "Flashcard",
        run: () => navigate("/flashcards"),
      });
    });

    quizzes.forEach((q) => {
      items.push({
        id: `quiz:${q.id}`,
        title: q.title,
        subtitle: `${q.questions?.length || 0} questions · Difficulty: ${q.difficulty}`,
        category: "Study Tools",
        filterGroup: "study",
        icon: "quiz",
        tone: "amber",
        badge: "Quiz",
        run: () => navigate("/quiz"),
      });
    });

    // 5. Notes
    notes.forEach((n) => {
      items.push({
        id: `note:${n.id}`,
        title: n.title || "Untitled note",
        subtitle: n.content?.slice(0, 80) || "Markdown note content",
        category: "Notes",
        filterGroup: "notes",
        icon: "notes",
        tone: "teal",
        badge: "Note",
        run: () => navigate(`/notes?id=${n.id}`),
      });
    });

    // 6. Navigation
    items.push(
      {
        id: "nav:dashboard",
        title: "Go to Dashboard",
        subtitle: "Overview of your workspace, study streak & active metrics",
        category: "Navigation",
        filterGroup: "actions",
        icon: "dashboard",
        tone: "blue",
        hint: "G D",
        run: () => navigate("/dashboard"),
      },
      {
        id: "nav:documents",
        title: "Go to Documents",
        subtitle: "Manage document library, folders & text ingestion",
        category: "Navigation",
        filterGroup: "documents",
        icon: "doc",
        tone: "emerald",
        hint: "G L",
        run: () => navigate("/documents"),
      },
      {
        id: "nav:chat",
        title: "Go to Chat",
        subtitle: "Multi-document conversation with citations",
        category: "Navigation",
        filterGroup: "chats",
        icon: "chat",
        tone: "purple",
        hint: "G C",
        run: () => navigate("/chat"),
      },
      {
        id: "nav:quiz",
        title: "Go to Quizzes",
        subtitle: "Practice tests, automated evaluations & score tracking",
        category: "Navigation",
        filterGroup: "study",
        icon: "quiz",
        tone: "amber",
        hint: "G Q",
        run: () => navigate("/quiz"),
      },
      {
        id: "nav:flashcards",
        title: "Go to Flashcards",
        subtitle: "Spaced repetition flashcards with SM-2 scheduling",
        category: "Navigation",
        filterGroup: "study",
        icon: "card",
        tone: "rose",
        hint: "G F",
        run: () => navigate("/flashcards"),
      },
      {
        id: "nav:notes",
        title: "Go to Notes",
        subtitle: "Study summaries, long notes & formula sheets",
        category: "Navigation",
        filterGroup: "notes",
        icon: "notes",
        tone: "teal",
        hint: "G N",
        run: () => navigate("/notes"),
      },
      {
        id: "nav:analytics",
        title: "Go to Analytics",
        subtitle: "Study time heatmaps, topic retention & progress metrics",
        category: "Navigation",
        filterGroup: "actions",
        icon: "chart",
        tone: "blue",
        hint: "G A",
        run: () => navigate("/analytics"),
      },
      {
        id: "nav:eval",
        title: "Go to Eval Dashboard",
        subtitle: "RAG accuracy benchmarks, precision, recall & MRR",
        category: "Navigation",
        filterGroup: "actions",
        icon: "eval",
        tone: "teal",
        hint: "G E",
        run: () => navigate("/eval"),
      },
      {
        id: "nav:profile",
        title: "Go to Profile & Passkeys",
        subtitle: "Account settings, WebAuthn passkeys & credentials",
        category: "Navigation",
        filterGroup: "actions",
        icon: "user",
        tone: "blue",
        hint: "G P",
        run: () => navigate("/profile"),
      }
    );

    return items;
  }, [query, docs, chats, flashcards, quizzes, notes, user, navigate, toggle, logout]);

  // Filter items by query and active tab
  const filtered = useMemo(() => {
    let list = allItems;
    if (activeFilter !== "all") {
      list = list.filter((item) => item.filterGroup === activeFilter);
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;

    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        (item.badge && item.badge.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))
    );
  }, [allItems, query, activeFilter]);

  // Global keydown (Cmd+K / Ctrl+K)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onCustom = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("synapse:command-palette", onCustom);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("synapse:command-palette", onCustom);
    };
  }, []);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveFilter("all");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 25);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query, activeFilter]);

  // Auto-scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(".syn-cmd-item.active");
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  function close() {
    setOpen(false);
  }

  function run(item: PaletteItem) {
    close();
    item.run();
  }

  function onDialogKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const tabs: CategoryFilter[] = ["all", "documents", "chats", "actions", "study", "notes"];
    const currentIndex = tabs.indexOf(activeFilter);
    const nextIndex = e.shiftKey
      ? (currentIndex - 1 + tabs.length) % tabs.length
      : (currentIndex + 1) % tabs.length;
    setActiveFilter(tabs[nextIndex]);
  }

  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (filtered.length > 0 ? (a + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (filtered.length > 0 ? (a - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[active];
      if (item) run(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  if (!open) return null;

  return (
    <div
      className="syn-cmd-overlay"
      onClick={close}
      role="presentation"
    >
      <div
        className="syn-cmd-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        ref={dialogRef}
        onKeyDown={onDialogKey}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top Executive Search Bar ── */}
        <div className="syn-cmd-search-bar">
          <div className="syn-cmd-search-icon">
            <Icon name="search" size={20} />
          </div>
          <input
            ref={inputRef}
            className="syn-cmd-input"
            placeholder="Type a command or search documents, chats, flashcards..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            aria-label="Command search"
            autoComplete="off"
            spellCheck="false"
          />
          {query && (
            <button
              type="button"
              className="syn-cmd-clear-btn"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              title="Clear search"
            >
              <Icon name="close" size={12} />
            </button>
          )}
          {loadingData && (
            <div className="syn-cmd-sync-pill">
              <span className="syn-cmd-spinner" />
              <span>syncing</span>
            </div>
          )}
          <div className="syn-cmd-esc-wrapper">
            <kbd className="syn-cmd-esc-kbd">ESC</kbd>
          </div>
        </div>

        {/* ── Minimalist Segmented Tabs ── */}
        <div className="syn-cmd-filters-bar">
          {[
            { id: "all" as const, label: "All Commands" },
            { id: "documents" as const, label: "Documents", count: docs.length },
            { id: "chats" as const, label: "Conversations", count: chats.length },
            { id: "actions" as const, label: "Actions & AI" },
            { id: "study" as const, label: "Study Tools", count: flashcards.length + quizzes.length },
            { id: "notes" as const, label: "Notes", count: notes.length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`syn-cmd-filter-pill${activeFilter === tab.id ? " active" : ""}`}
              onClick={() => setActiveFilter(tab.id)}
            >
              <span>{tab.label}</span>
              {typeof tab.count === "number" && tab.count > 0 && (
                <span className="syn-cmd-filter-count">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Results Container ── */}
        <div className="syn-cmd-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="syn-cmd-empty">
              <div className="syn-cmd-empty-icon">
                <Icon name="search" size={26} />
              </div>
              <h3 className="syn-cmd-empty-title">
                No commands matching &ldquo;{query}&rdquo;
              </h3>
              <p className="syn-cmd-empty-desc">
                Search your workspace across indexed documents, chat histories, active flashcard decks, and system actions.
              </p>
              {query && (
                <button
                  type="button"
                  className="syn-cmd-empty-action"
                  onClick={() => {
                    close();
                    navigate(`/chat?q=${encodeURIComponent(query.trim())}`);
                  }}
                >
                  <Icon name="sparkles" size={16} />
                  <span>Synthesize with AI: &ldquo;{query.trim()}&rdquo;</span>
                </button>
              )}
            </div>
          ) : (
            filtered.map((item, i) => {
              const prevItem = filtered[i - 1];
              const showCategory =
                !query && (!prevItem || prevItem.category !== item.category);

              return (
                <div key={item.id} className="syn-cmd-group-wrapper">
                  {showCategory && (
                    <div className="syn-cmd-section-header">
                      <span className="syn-cmd-section-title">{item.category}</span>
                      <span className="syn-cmd-section-line" />
                    </div>
                  )}
                  <button
                    className={`syn-cmd-item ${i === active ? "active" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => run(item)}
                    type="button"
                  >
                    <div className={`syn-cmd-item-glyph ${item.tone || "neutral"}`}>
                      <Icon name={item.icon} size={17} />
                    </div>

                    <div className="syn-cmd-item-info">
                      <div className="syn-cmd-title-row">
                        <span className="syn-cmd-item-title">{item.title}</span>
                        {item.badge && <span className="syn-cmd-badge">{item.badge}</span>}
                      </div>
                      {item.subtitle && (
                        <span className="syn-cmd-item-subtitle">{item.subtitle}</span>
                      )}
                    </div>

                    {item.meta && <span className="syn-cmd-meta">{item.meta}</span>}
                    {item.hint && <span className="syn-cmd-hint">{item.hint}</span>}

                    {i === active ? (
                      <div className="syn-cmd-enter-prompt">
                        <span className="syn-cmd-enter-label">Open</span>
                        <kbd className="syn-cmd-enter-key">↵</kbd>
                      </div>
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* ── Executive Bottom Status Bar ── */}
        <div className="syn-cmd-footer">
          <div className="syn-cmd-shortcuts">
            <div className="syn-cmd-shortcut-item">
              <kbd className="syn-cmd-kbd">↑</kbd>
              <kbd className="syn-cmd-kbd">↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="syn-cmd-shortcut-item">
              <kbd className="syn-cmd-kbd">↵</kbd>
              <span>Execute</span>
            </div>
            <div className="syn-cmd-shortcut-item">
              <kbd className="syn-cmd-kbd">Tab</kbd>
              <span>Filter</span>
            </div>
            <div className="syn-cmd-shortcut-item">
              <kbd className="syn-cmd-kbd">Esc</kbd>
              <span>Dismiss</span>
            </div>
          </div>

          <div className="syn-cmd-footer-right">
            <span className="syn-cmd-brand-tag">
              <BrandLogo size={16} />
              <span>SYNAPSE Spotlight</span>
            </span>
            <span className="syn-cmd-counter">
              {filtered.length} {filtered.length === 1 ? "match" : "matches"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { VoiceWaveform } from "../components/VoiceWaveform";
import { chatApi } from "../api/chat";
import { documentsApi } from "../api/documents";
import { analyticsApi } from "../api/analytics";
import { studyApi } from "../api/study";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Modal } from "../components/ui/Modal";
import { Tip } from "../components/Tip";
import { TIP } from "../components/tips";
import { Skeleton } from "../components/ui/Skeleton";
import { DocumentScopePicker } from "../components/DocumentScopePicker";
import { MarkdownContent } from "../components/ui/MarkdownContent";
import { CitationChip } from "../components/CitationChip";
import { MessageActionToolbar } from "../components/MessageActionToolbar";
import { WebCitationChip } from "../components/WebCitationChip";
import {
  getTimeBlockConfig,
  extractFirstName,
  buildContextAwareSuggestions,
} from "../utils/timeBlock";
import type {
  ConversationListItem,
  SourceResponse,
  DocumentResponse,
  DashboardResponse,
  FlashcardResponse,
  QueryCorrectionPayload,
} from "../types/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceResponse[];
  correction?: QueryCorrectionPayload;
}

export default function Chat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const firstName = extractFirstName(user);
  const timeBlock = getTimeBlockConfig(new Date().getHours(), firstName);

  const [contextDocuments, setContextDocuments] = useState<DocumentResponse[]>([]);
  const [contextDashboard, setContextDashboard] = useState<DashboardResponse | null>(null);
  const [contextDueCards, setContextDueCards] = useState<FlashcardResponse[]>([]);

  useEffect(() => {
    let active = true;
    async function loadContextData() {
      try {
        const [docsRes, dashRes, dueRes] = await Promise.allSettled([
          documentsApi.list(),
          analyticsApi.dashboard(),
          studyApi.dueFlashcards(),
        ]);
        if (!active) return;
        if (docsRes.status === "fulfilled") setContextDocuments(docsRes.value);
        if (dashRes.status === "fulfilled") setContextDashboard(dashRes.value);
        if (dueRes.status === "fulfilled") setContextDueCards(dueRes.value);
      } catch {
        // Fallback gracefully
      }
    }
    void loadContextData();
    return () => {
      active = false;
    };
  }, []);

  const dynamicSuggestions = useMemo(() => {
    return buildContextAwareSuggestions(contextDocuments, contextDashboard, contextDueCards);
  }, [contextDocuments, contextDashboard, contextDueCards]);

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const docParam = searchParams.get("doc") || searchParams.get("scope");
  const [scopeIds, setScopeIds] = useState<string[]>(() => {
    if (docParam) {
      return docParam.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return [];
  });
  const [busy, setBusy] = useState(false);
  const [loadingConv, setLoadingConv] = useState(true);

  useEffect(() => {
    const p = searchParams.get("doc") || searchParams.get("scope");
    if (p) {
      const ids = p.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        setScopeIds(ids);
      }
    }
  }, [searchParams]);
  const [activeSource, setActiveSource] = useState<SourceResponse | null>(null);
  const [conversationsOpen, setConversationsOpen] = useState(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 768) {
      return false;
    }
    return true;
  });
  const [webMode, setWebMode] = useState(false);
  const [insightMode, setInsightMode] = useState(true);

  const [renamingConv, setRenamingConv] = useState<string | null>(null);
  const [convDraft, setConvDraft] = useState("");
  const [editingMsg, setEditingMsg] = useState<string | null>(null);
  const [msgDraft, setMsgDraft] = useState("");
  const [deleteConv, setDeleteConv] = useState<ConversationListItem | null>(null);
  const [convSearch, setConvSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedModel, setSelectedModel] = useState("Synapse Hybrid RAG");
  const [showModelMenu, setShowModelMenu] = useState(false);

  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("synapse_pinned_conversations");
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("synapse_unread_conversations");
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const [showSuggestions, setShowSuggestions] = useState<boolean>(true);

  interface ChatGroup {
    id: string;
    name: string;
  }

  const [groups, setGroups] = useState<ChatGroup[]>(() => {
    try {
      const saved = localStorage.getItem("synapse_chat_groups_v1");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [convGroupMap, setConvGroupMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("synapse_conv_group_map_v1");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [groupModalConvId, setGroupModalConvId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [groupDraftName, setGroupDraftName] = useState("");

  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  const [menuGroupPos, setMenuGroupPos] = useState<{ top: number; left: number } | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [chatsSectionCollapsed, setChatsSectionCollapsed] = useState(false);
  const [pinnedSectionCollapsed, setPinnedSectionCollapsed] = useState(false);

  const toggleCollapseGroup = (groupId: string) => {
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const [menuConvId, setMenuConvId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const togglePin = (convId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      const isPinned = next.has(convId);
      if (isPinned) {
        next.delete(convId);
        toast("info", "Unpinned", "Conversation removed from pinned.");
      } else {
        next.add(convId);
        toast("info", "Pinned", "Conversation moved to Pinned section.");
      }
      localStorage.setItem("synapse_pinned_conversations", JSON.stringify(Array.from(next)));
      return next;
    });
    setMenuConvId(null);
  };

  const toggleUnread = (convId: string) => {
    setUnreadIds((prev) => {
      const next = new Set(prev);
      const isUnread = next.has(convId);
      if (isUnread) {
        next.delete(convId);
        toast("info", "Marked as read", "Conversation marked as read.");
      } else {
        next.add(convId);
        toast("info", "Marked as unread", "Conversation marked as unread.");
      }
      localStorage.setItem("synapse_unread_conversations", JSON.stringify(Array.from(next)));
      return next;
    });
    setMenuConvId(null);
  };

  const createGroupAndMove = (convId: string, groupName: string) => {
    const trimmed = groupName.trim();
    if (!trimmed) return;
    const newGroup: ChatGroup = {
      id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
    };
    const updatedGroups = [...groups, newGroup];
    const updatedMap = { ...convGroupMap, [convId]: newGroup.id };
    setGroups(updatedGroups);
    setConvGroupMap(updatedMap);
    localStorage.setItem("synapse_chat_groups_v1", JSON.stringify(updatedGroups));
    localStorage.setItem("synapse_conv_group_map_v1", JSON.stringify(updatedMap));
    setGroupModalConvId(null);
    setNewGroupName("");
    toast("info", `Moved to "${trimmed}"`, "Group created successfully.");
  };

  const moveToExistingGroup = (convId: string, groupId: string) => {
    const updatedMap = { ...convGroupMap, [convId]: groupId };
    setConvGroupMap(updatedMap);
    localStorage.setItem("synapse_conv_group_map_v1", JSON.stringify(updatedMap));
    setGroupModalConvId(null);
    const grp = groups.find((g) => g.id === groupId);
    toast("info", "Moved to group", `Moved to "${grp?.name || "Group"}".`);
  };

  const removeFromGroup = (convId: string) => {
    const updatedMap = { ...convGroupMap };
    delete updatedMap[convId];
    setConvGroupMap(updatedMap);
    localStorage.setItem("synapse_conv_group_map_v1", JSON.stringify(updatedMap));
    setGroupModalConvId(null);
    toast("info", "Removed from group", "Conversation removed from group.");
  };

  const renameGroup = (groupId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setRenamingGroupId(null);
      return;
    }
    const updatedGroups = groups.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g));
    setGroups(updatedGroups);
    localStorage.setItem("synapse_chat_groups_v1", JSON.stringify(updatedGroups));
    setRenamingGroupId(null);
    toast("info", "Group renamed", `Renamed to "${trimmed}".`);
  };

  const deleteGroup = (groupId: string) => {
    const updatedGroups = groups.filter((g) => g.id !== groupId);
    const updatedMap = { ...convGroupMap };
    Object.keys(updatedMap).forEach((convId) => {
      if (updatedMap[convId] === groupId) {
        delete updatedMap[convId];
      }
    });
    setGroups(updatedGroups);
    setConvGroupMap(updatedMap);
    localStorage.setItem("synapse_chat_groups_v1", JSON.stringify(updatedGroups));
    localStorage.setItem("synapse_conv_group_map_v1", JSON.stringify(updatedMap));
    toast("info", "Group deleted", "Chats moved back to main list.");
  };

  const { pinnedList, groupedSections, unpinnedList } = useMemo(() => {
    const list = conversations.filter((c) =>
      (c.title || "Untitled chat").toLowerCase().includes(convSearch.toLowerCase())
    );

    const pinned: ConversationListItem[] = [];
    const inGroups: Record<string, ConversationListItem[]> = {};
    const unpinned: ConversationListItem[] = [];

    for (const c of list) {
      if (pinnedIds.has(c.id)) {
        pinned.push(c);
      } else if (convGroupMap[c.id]) {
        const gId = convGroupMap[c.id];
        if (!inGroups[gId]) inGroups[gId] = [];
        inGroups[gId].push(c);
      } else {
        unpinned.push(c);
      }
    }

    const groupSecs = groups
      .map((g) => ({
        group: g,
        items: inGroups[g.id] || [],
      }))
      .filter((s) => s.items.length > 0 || !convSearch);

    return { pinnedList: pinned, groupedSections: groupSecs, unpinnedList: unpinned };
  }, [conversations, convSearch, pinnedIds, convGroupMap, groups]);

  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const shouldFollowLatestRef = useRef(true);

  // ── Voice input ───────────────────────────────────────────────────────────
  const {
    isSupported: voiceSupported,
    isListening,
    audioStream,
    error: voiceError,
    startListening,
    confirmListening,
    cancelListening,
    clearError: clearVoiceError,
  } = useVoiceInput();

  const voiceBaseInputRef = useRef<string>("");

  /** Confirm current voice input, stop listening and focus textarea */
  const handleVoiceConfirm = useCallback(() => {
    confirmListening();
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = ta.value.length;
      }
    }, 50);
  }, [confirmListening]);

  /** Cancel voice input, revert back to previous text and focus textarea */
  const handleVoiceCancel = useCallback(() => {
    cancelListening();
    setInput(voiceBaseInputRef.current);
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = ta.value.length;
      }
    }, 50);
  }, [cancelListening]);

  /** Toggle mic on/off; feeds transcripts directly into the input state */
  const handleVoiceToggle = () => {
    if (!voiceSupported) return;
    if (isListening) {
      handleVoiceConfirm();
    } else {
      clearVoiceError();
      voiceBaseInputRef.current = input;
      startListening((text) => {
        const base = voiceBaseInputRef.current;
        const prefix = base ? (base.endsWith(" ") ? base : base + " ") : "";
        setInput(prefix + text);
      });
    }
  };

  // Keyboard shortcut support during active listening: Escape to cancel, Enter to confirm
  useEffect(() => {
    if (!isListening) return;
    function handleVoiceKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleVoiceCancel();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleVoiceConfirm();
      }
    }
    window.addEventListener("keydown", handleVoiceKey);
    return () => window.removeEventListener("keydown", handleVoiceKey);
  }, [isListening, handleVoiceCancel, handleVoiceConfirm]);
  // ─────────────────────────────────────────────────────────────────────────

  // Close context menu on outside click or keyboard shortcut
  useEffect(() => {
    if (!menuConvId && !menuGroupId) return;
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as HTMLElement;
      if (
        !target.closest(".conv-context-menu") &&
        !target.closest(".cbi-menu-trigger") &&
        !target.closest(".group-action-btn")
      ) {
        setMenuConvId(null);
        setMenuGroupId(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuConvId(null);
        setMenuGroupId(null);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuConvId, menuGroupId]);

  // Close model menu on tap / click outside or Escape
  useEffect(() => {
    if (!showModelMenu) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowModelMenu(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showModelMenu]);

  const loadConversations = useCallback(async () => {
    try {
      const list = await chatApi.listConversations();
      setConversations(list);
    } catch (err) {
      toast(
        "error",
        "Couldn't load conversations",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setLoadingConv(false);
    }
  }, [toast]);

  const openConversation = useCallback(async (id: string) => {
    if (id.startsWith("temp-")) return;
    if (typeof window !== "undefined" && window.innerWidth <= 768) {
      setConversationsOpen(false);
    }
    shouldFollowLatestRef.current = true;
    setActiveId(id);
    if (unreadIds.has(id)) {
      setUnreadIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        localStorage.setItem("synapse_unread_conversations", JSON.stringify(Array.from(next)));
        return next;
      });
    }
    try {
      const detail = await chatApi.getConversation(id);
      setMessages(
        detail.messages.map((m) => ({
          id: m.id,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          sources: m.sources,
        })),
      );
    } catch (err) {
      toast(
        "error",
        "Couldn't open chat",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }, [toast, unreadIds]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const convParam = searchParams.get("conv");
    const docParam = searchParams.get("doc");
    const scopeParam = searchParams.get("scope");
    const qParam = searchParams.get("q");

    if (convParam) {
      void openConversation(convParam);
    }
    if (scopeParam) {
      setScopeIds(scopeParam.split(",").filter(Boolean));
    } else if (docParam) {
      setScopeIds([docParam]);
    }
    if (qParam) {
      setInput(qParam);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [searchParams, openConversation]);

  // Keep the latest exchange in view while someone is actively chatting, but
  // never pull readers away from earlier messages they have scrolled up to.
  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (!thread || !shouldFollowLatestRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages]);

  const [showScrollBottom, setShowScrollBottom] = useState(false);

  function handleThreadScroll() {
    const thread = threadRef.current;
    if (!thread) return;
    const isNearBottom =
      thread.scrollHeight - thread.scrollTop - thread.clientHeight < 96;
    shouldFollowLatestRef.current = isNearBottom;
    setShowScrollBottom(!isNearBottom);
  }

  function scrollToBottom() {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
  }

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  const renderConvItem = (c: ConversationListItem) => {
    const isRenaming = renamingConv === c.id;
    const isPinned = pinnedIds.has(c.id);
    const isUnread = unreadIds.has(c.id);
    const isActive = activeId === c.id;

    return (
      <div
        key={c.id}
        className={`conv-bullet-item ${isActive ? "active" : ""} ${isUnread ? "is-unread" : ""} ${isPinned ? "is-pinned" : ""}`}
      >
        {isRenaming ? (
          <input
            className="conv-rename-input"
            autoFocus
            value={convDraft}
            onChange={(e) => setConvDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRenameConv(c.id);
              if (e.key === "Escape") setRenamingConv(null);
            }}
            onBlur={() => void commitRenameConv(c.id)}
          />
        ) : (
          <>
            <button
              type="button"
              className="cbi-main"
              onClick={() => void openConversation(c.id)}
              title={c.title || "Untitled chat"}
            >
              <span className={`cbi-dot ${isPinned ? "is-pinned" : ""} ${isUnread ? "is-unread" : ""}`}>
                {isPinned ? (
                  <Icon name="pin" size={11} />
                ) : isUnread ? (
                  <span className="cbi-unread-circle" />
                ) : (
                  "○"
                )}
              </span>
              <span className="cbi-title">
                {c.title || "Untitled chat"}
              </span>
            </button>
            <div className="cbi-actions">
              <button
                type="button"
                className={`cbi-action-btn cbi-menu-trigger ${menuConvId === c.id ? "active" : ""}`}
                aria-label={`Options for ${c.title}`}
                title="More options"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenuPos({
                    top: rect.bottom + 4,
                    left: Math.max(8, Math.min(rect.left - 130, window.innerWidth - 200)),
                  });
                  setMenuConvId(menuConvId === c.id ? null : c.id);
                }}
              >
                <Icon name="moreVertical" size={13} />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  function startNew() {
    if (busy) return;
    if (typeof window !== "undefined" && window.innerWidth <= 768) {
      setConversationsOpen(false);
    }
    shouldFollowLatestRef.current = true;
    setActiveId(null);
    setMessages([]);
  }

  async function removeConv(c: ConversationListItem) {
    const wasActive = activeId === c.id;
    setConversations((cs) => cs.filter((x) => x.id !== c.id));
    if (wasActive) {
      setActiveId(null);
      setMessages([]);
    }
    setDeleteConv(null);
    try {
      await chatApi.deleteConversation(c.id);
    } catch (err) {
      toast(
        "error",
        "Failed to delete conversation",
        err instanceof ApiError ? err.message : "Please try again.",
      );
      void loadConversations();
    }
  }

  function beginRenameConv(c: ConversationListItem) {
    setRenamingConv(c.id);
    setConvDraft(c.title || "");
  }

  async function commitRenameConv(id: string) {
    const title = convDraft.trim();
    setRenamingConv(null);
    if (!title) return;
    setConversations((cs) =>
      cs.map((c) => (c.id === id ? { ...c, title } : c)),
    );
    try {
      await chatApi.renameConversation(id, title);
    } catch (err) {
      toast(
        "error",
        "Failed to rename",
        err instanceof ApiError ? err.message : "Please try again.",
      );
      void loadConversations();
    }
  }

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || busy) return;

    const docScope = scopeIds;
    const currentWebMode = webMode;
    const currentInsightMode = insightMode;
    const isNew = !activeId;
    const tempId = `temp-${Date.now()}`;
    const optimisticTitle = text.slice(0, 50) || "New Chat";
    const nowIso = new Date().toISOString();

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      sources: [],
    };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      sources: [],
    };

    // Sending is an intentional request for the newest response, so resume
    // following. A subsequent manual scroll immediately opts back out.
    shouldFollowLatestRef.current = true;
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    if (!overrideText) setInput("");
    setBusy(true);

    if (isNew) {
      setConversations((prev) => [
        {
          id: tempId,
          title: optimisticTitle,
          created_at: nowIso,
          updated_at: nowIso,
          message_count: 1,
        },
        ...prev.filter((c) => !c.id.startsWith("temp-")),
      ]);
    }

    const patchAssistant = (patch: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
      );
    };

    let confirmedId = activeId;

    try {
      await chatApi.sendMessage(
        {
          message: text,
          conversation_id: activeId || undefined,
          document_scope: docScope.length ? docScope : undefined,
          web_mode: currentWebMode,
          insight_mode: currentInsightMode,
        },
        {
          onConversation: (convPayload) => {
            if (convPayload.conversation_id) {
              const newId = convPayload.conversation_id;
              confirmedId = newId;
              setActiveId(newId);
              setConversations((prev) => {
                const hasItem = prev.some(
                  (c) => c.id === newId || c.id === tempId || c.id.startsWith("temp-"),
                );
                if (hasItem) {
                  return prev.map((c) =>
                    c.id === tempId || c.id === newId || c.id.startsWith("temp-")
                      ? {
                          ...c,
                          id: newId,
                          title: convPayload.title || c.title,
                          updated_at: convPayload.updated_at || c.updated_at,
                        }
                      : c,
                  );
                }
                return [
                  {
                    id: newId,
                    title: convPayload.title || optimisticTitle,
                    created_at: convPayload.created_at || nowIso,
                    updated_at: convPayload.updated_at || nowIso,
                    message_count: 1,
                  },
                  ...prev,
                ];
              });
            }
          },
          onSources: (s: SourceResponse[]) => patchAssistant({ sources: s }),
          onCorrection: (c: QueryCorrectionPayload) => patchAssistant({ correction: c }),
          onToken: (t: string) =>
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + t } : m,
              ),
            ),
          onDone: (payload) => {
            if (payload?.conversation_id) {
              const finalId = payload.conversation_id;
              setActiveId(finalId);
              void loadConversations();
            }
          },
          onError: (e: Error) => {
            toast("error", "Chat error", e.message);
            patchAssistant({ content: `⚠️ ${e.message}` });
            if (isNew && !confirmedId) {
              setConversations((prev) => prev.filter((c) => c.id !== tempId));
            }
          },
        },
      );
    } catch {
      if (isNew && !confirmedId) {
        setConversations((prev) => prev.filter((c) => c.id !== tempId));
      }
    } finally {
      setBusy(false);
    }
  }

  function beginEditMsg(m: ChatMessage) {
    setEditingMsg(m.id);
    setMsgDraft(m.content);
  }

  async function commitEditMsg(m: ChatMessage) {
    if (!m.id || !activeId) return;
    const content = msgDraft.trim();
    if (!content || content === m.content) return;
    setEditingMsg(null);
    setMessages((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, content } : x)),
    );
    try {
      await chatApi.updateMessage(activeId, m.id, content);
    } catch (err) {
      toast(
        "error",
        "Failed to edit message",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function removeMsg(m: ChatMessage) {
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    if (m.id.startsWith("temp-") || !activeId) return;
    try {
      await chatApi.deleteMessage(activeId, m.id);
    } catch (err) {
      toast(
        "error",
        "Failed to delete message",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  function regenerateAssistantMessage(asstIdx: number) {
    if (busy || asstIdx < 1) return;
    const userMsg = messages[asstIdx - 1];
    if (!userMsg || userMsg.role !== "user") return;
    setMessages((prev) => prev.slice(0, asstIdx));
    void send(userMsg.content);
  }

  function populatePrompt(text: string) {
    setInput(text);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = text.length;
        textareaRef.current.selectionEnd = text.length;
      }
    }, 40);
  }

  function onKey(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const renderComposerContent = () => (
    <>
      {isListening ? (
        <div className="voice-dictation-card" role="region" aria-label="Voice input active">
          <div className="voice-dictation-top">
            <span className="voice-dictation-label">Listening...</span>
          </div>
          <div className="voice-dictation-body">
            <div className="voice-waveform-wrap">
              <VoiceWaveform audioStream={audioStream} isListening={isListening} />
            </div>
            <div className="voice-dictation-actions">
              <button
                type="button"
                className="voice-cancel-btn"
                onClick={handleVoiceCancel}
                title="Cancel voice input (Esc)"
                aria-label="Cancel voice input"
              >
                <Icon name="close" size={17} />
              </button>
              <button
                type="button"
                className="voice-confirm-btn"
                onClick={handleVoiceConfirm}
                title="Confirm voice input (Enter)"
                aria-label="Confirm voice input"
              >
                <Icon name="check" size={17} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="composer">
          <textarea
            ref={textareaRef}
            placeholder="How can I help you today?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            className="composer-textarea"
          />

          <div className="composer-bottom-bar">
            {/* ── Left Side: Segmented Source Toggle Switch (Insight vs Web) ── */}
            <div className="composer-bottom-left">
              <div className="composer-source-segmented" role="radiogroup" aria-label="Knowledge source switch">
                <button
                  type="button"
                  className={`composer-source-seg-btn${insightMode ? " active" : ""}`}
                  title="Insight Source — answers strictly from your uploaded documents"
                  aria-checked={insightMode}
                  role="radio"
                  onClick={() => {
                    setInsightMode(true);
                    setWebMode(false);
                  }}
                >
                  <Icon name="search" size={13} className="source-seg-icon" />
                  <span>Insight Source</span>
                </button>

                <button
                  type="button"
                  className={`composer-source-seg-btn${webMode ? " active" : ""}`}
                  title="Web Source — answers from live web search"
                  aria-checked={webMode}
                  role="radio"
                  onClick={() => {
                    setWebMode(true);
                    setInsightMode(false);
                  }}
                >
                  <Icon name="globe" size={13} className="source-seg-icon" />
                  <span>Web Source</span>
                </button>
              </div>
            </div>

            {/* ── Right Side: Document Picker -> Model -> Mic -> Send ── */}
            <div className="composer-bottom-right">
              {/* Select Document (styled same as model selector pill) */}
              <div className="composer-scope-wrapper">
                <DocumentScopePicker
                  value={scopeIds}
                  onChange={setScopeIds}
                  allowUpload
                  popupDirection="up"
                  size="sm"
                  minimal
                />
              </div>

              {/* Model Selector Pill */}
              <div ref={modelMenuRef} className="composer-model-dropdown-wrap">
                <button
                  type="button"
                  className="composer-model-pill"
                  onClick={() => setShowModelMenu(!showModelMenu)}
                  title="Select AI Model / Pipeline"
                >
                  <span>{selectedModel}</span>
                  <Icon name="chevronDown" size={13} />
                </button>

                {showModelMenu && (
                  <div className="composer-model-menu">
                    {[
                      {
                        id: "synapse-hybrid",
                        name: "Synapse Hybrid RAG",
                        desc: "Dense Vector + BM25 keyword retrieval",
                      },
                      {
                        id: "custom-models",
                        name: "Custom Models (Coming Soon)",
                        desc: "Fine-tuned domain models",
                        disabled: true,
                      },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        disabled={m.disabled}
                        className={`cm-item ${selectedModel === m.name ? "active" : ""} ${m.disabled ? "disabled" : ""}`}
                        onClick={() => {
                          if (!m.disabled) {
                            setSelectedModel(m.name);
                            setShowModelMenu(false);
                          }
                        }}
                      >
                        <div className="cm-item-text">
                          <span className="cm-item-title">{m.name}</span>
                          <span className="cm-item-desc">{m.desc}</span>
                        </div>
                        {selectedModel === m.name && <Icon name="check" size={12} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Microphone Voice Button */}
              <button
                type="button"
                className={`composer-voice-btn${!voiceSupported ? " is-disabled" : ""}`}
                title={
                  !voiceSupported
                    ? "Voice input isn't supported in this browser — try Chrome or Edge."
                    : "Start voice input"
                }
                aria-label="Start voice input"
                disabled={!voiceSupported}
                onClick={handleVoiceToggle}
              >
                <Icon name="mic" size={17} />
              </button>

              {/* Send Button */}
              {input.trim() && (
                <button
                  type="button"
                  className="composer-send-btn"
                  onClick={() => void send()}
                  disabled={busy || !input.trim()}
                  title="Send (Enter)"
                  aria-label="Send message"
                >
                  {busy ? (
                    <span className="spinner spinner-sm" />
                  ) : (
                    <Icon name="send" size={14} />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Voice error feedback ── */}
      {voiceError === "permission-denied" && (
        <div className="voice-status-row voice-status-error" role="alert">
          <Icon name="mic" size={13} />
          <span>
            Microphone access was blocked. Enable it in your browser&rsquo;s site
            settings and try again.
          </span>
          <button
            type="button"
            className="voice-status-dismiss"
            aria-label="Dismiss"
            onClick={clearVoiceError}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      )}
      {voiceError === "recognition-error" && (
        <div className="voice-status-row voice-status-error" role="alert">
          <Icon name="mic" size={13} />
          <span>Voice input failed — please try again or type your question.</span>
          <button
            type="button"
            className="voice-status-dismiss"
            aria-label="Dismiss"
            onClick={clearVoiceError}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      <div className={`chat-layout${conversationsOpen ? "" : " conversations-collapsed"}`}>
        {conversationsOpen && (
          <div
            className="chat-mobile-conv-backdrop"
            onClick={() => setConversationsOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* ── Left Sidebar: New Chat + Search + Collapse -> Chats and Tasks ── */}
        <aside className="conv-panel">
          <div className="conv-sidebar-content">
            {/* ── Top Bar: Tool Icons (Menu, Search, Collapse) ── */}
            <div className="conv-top-action-bar">
              {isSearching ? (
                <div className="conv-inline-search-wrap">
                  <Icon name="search" size={14} className="conv-search-icon" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="conv-search-input"
                    placeholder="Search chat history…"
                    value={convSearch}
                    onChange={(e) => setConvSearch(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="conv-icon-btn"
                    onClick={() => {
                      setConvSearch("");
                      setIsSearching(false);
                    }}
                    title="Close search"
                    aria-label="Close search"
                  >
                    <Icon name="close" size={12} />
                  </button>
                  <button
                    type="button"
                    className="conv-icon-btn"
                    onClick={() => setConversationsOpen(false)}
                    title="Collapse sidebar"
                    aria-label="Collapse sidebar"
                  >
                    <Icon name="panelLeft" size={17} />
                  </button>
                </div>
              ) : (
                <div className="conv-top-bar-row">
                  <button
                    type="button"
                    className="conv-icon-btn"
                    onClick={() => window.dispatchEvent(new CustomEvent("synapse:toggle-app-sidebar"))}
                    title="Open main navigation"
                    aria-label="Open main navigation"
                  >
                    <Icon name="menu" size={20} />
                  </button>
                  <div className="conv-top-right-tools">
                    <button
                      type="button"
                      className="conv-icon-btn"
                      onClick={() => {
                        setIsSearching(true);
                        setTimeout(() => searchInputRef.current?.focus(), 50);
                      }}
                      title="Search chat history"
                      aria-label="Search chat history"
                    >
                      <Icon name="search" size={19} />
                    </button>
                    <button
                      type="button"
                      className="conv-icon-btn"
                      onClick={() => setConversationsOpen(false)}
                      title="Collapse sidebar"
                      aria-label="Collapse sidebar"
                    >
                      <Icon name="panelLeft" size={19} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Full-size New Chat Button on Next Line ── */}
            <div className="conv-full-new-wrap">
              <button
                type="button"
                className="conv-full-new-chat-btn"
                onClick={startNew}
                title="Start a new conversation"
              >
                <span className="conv-full-new-icon-wrap">
                  <Icon name="plus" size={16} />
                </span>
                <span>New chat</span>
              </button>
            </div>

            {/* ── Chats and Tasks Section ── */}
            <div className="conv-chats-section">
              {loadingConv ? (
                <div className="stack" style={{ padding: "8px 4px", gap: 6 }}>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} height="28px" />
                  ))}
                </div>
              ) : (
                <div className="conv-items-list">
                  {pinnedList.length === 0 && unpinnedList.length === 0 && groupedSections.every((s) => s.items.length === 0) && (
                    <div className="conv-empty-hint">
                      {convSearch ? "No matching chats found" : "No chats yet"}
                    </div>
                  )}

                  {/* ── Pinned Section ── */}
                  {pinnedList.length > 0 && (
                    <div className="conv-section-block">
                      <div className="conv-section-header">
                        <button
                          type="button"
                          className="conv-section-title conv-sec-collapse-btn"
                          onClick={() => setPinnedSectionCollapsed(!pinnedSectionCollapsed)}
                          title={`${pinnedSectionCollapsed ? "Expand" : "Collapse"} pinned chats`}
                        >
                          <Icon name="pin" size={11} className="conv-sec-pin-icon" />
                          <span>Pinned</span>
                          <Icon
                            name="chevronDown"
                            size={12}
                            className={`conv-sec-chevron ${pinnedSectionCollapsed ? "collapsed" : ""}`}
                          />
                        </button>
                      </div>
                      {!pinnedSectionCollapsed && (
                        <div className="conv-items-list-inner">
                          {pinnedList.map((c) => renderConvItem(c))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Custom Groups Section ── */}
                  {groupedSections.map(({ group, items }) => {
                    const isCollapsed = collapsedGroupIds.has(group.id);
                    return (
                      <div key={group.id} className="conv-section-block">
                        <div className="conv-section-header group-header">
                          {renamingGroupId === group.id ? (
                            <input
                              className="group-rename-input"
                              autoFocus
                              value={groupDraftName}
                              onChange={(e) => setGroupDraftName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") renameGroup(group.id, groupDraftName);
                                if (e.key === "Escape") setRenamingGroupId(null);
                              }}
                              onBlur={() => renameGroup(group.id, groupDraftName)}
                            />
                          ) : (
                            <>
                              <button
                                type="button"
                                className="conv-section-title group-title group-collapse-btn"
                                onClick={() => toggleCollapseGroup(group.id)}
                                title={`${isCollapsed ? "Expand" : "Collapse"} ${group.name}`}
                              >
                                <span>{group.name}</span>
                                <Icon
                                  name="chevronDown"
                                  size={12}
                                  className={`conv-sec-chevron ${isCollapsed ? "collapsed" : ""}`}
                                />
                              </button>
                              <div className="group-header-actions">
                                <button
                                  type="button"
                                  className={`group-action-btn ${menuGroupId === group.id ? "active" : ""}`}
                                  title="Group settings"
                                  aria-label={`Options for group ${group.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setMenuGroupPos({
                                      top: rect.bottom + 4,
                                      left: Math.max(8, Math.min(rect.left - 100, window.innerWidth - 170)),
                                    });
                                    setMenuGroupId(menuGroupId === group.id ? null : group.id);
                                  }}
                                >
                                  <Icon name="tune" size={14} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        {!isCollapsed && (
                          <div className="conv-items-list-inner">
                            {items.map((c) => renderConvItem(c))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* ── Main Chats and Tasks Section ── */}
                  <div className="conv-section-block">
                    <div className="conv-section-header">
                      <button
                        type="button"
                        className="conv-section-title conv-sec-collapse-btn"
                        onClick={() => setChatsSectionCollapsed(!chatsSectionCollapsed)}
                        title={`${chatsSectionCollapsed ? "Expand" : "Collapse"} chats and tasks`}
                      >
                        <span>Chats and tasks</span>
                        <Icon
                          name="chevronDown"
                          size={12}
                          className={`conv-sec-chevron ${chatsSectionCollapsed ? "collapsed" : ""}`}
                        />
                      </button>
                    </div>
                    {!chatsSectionCollapsed && (
                      <div className="conv-items-list-inner">
                        {unpinnedList.map((c) => renderConvItem(c))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ── Group Options Context Menu (Rename, Delete) ── */}
        {menuGroupId && menuGroupPos && (
          <div
            className="conv-context-menu group-context-menu"
            style={{ top: `${menuGroupPos.top}px`, left: `${menuGroupPos.left}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="conv-menu-item"
              onClick={() => {
                const grp = groups.find((g) => g.id === menuGroupId);
                setMenuGroupId(null);
                if (grp) {
                  setRenamingGroupId(grp.id);
                  setGroupDraftName(grp.name);
                }
              }}
            >
              <span className="cmi-icon"><Icon name="edit" size={14} /></span>
              <span className="cmi-label">Rename</span>
            </button>
            <div className="conv-menu-divider" />
            <button
              type="button"
              className="conv-menu-item cmi-danger"
              onClick={() => {
                const gId = menuGroupId;
                setMenuGroupId(null);
                deleteGroup(gId);
              }}
            >
              <span className="cmi-icon"><Icon name="trash" size={14} /></span>
              <span className="cmi-label">Delete</span>
            </button>
          </div>
        )}

        {/* ── Context Menu Popup (Pin, Mark as unread, Move to group, Rename, Delete) ── */}
        {menuConvId && menuPos && (
          <div
            className="conv-context-menu"
            style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="conv-menu-item"
              onClick={() => togglePin(menuConvId)}
            >
              <span className="cmi-icon"><Icon name="pin" size={14} /></span>
              <span className="cmi-label">{pinnedIds.has(menuConvId) ? "Unpin" : "Pin"}</span>
            </button>
            <button
              type="button"
              className="conv-menu-item"
              onClick={() => toggleUnread(menuConvId)}
            >
              <span className="cmi-icon"><Icon name="eyeOff" size={14} /></span>
              <span className="cmi-label">{unreadIds.has(menuConvId) ? "Mark as read" : "Mark as unread"}</span>
            </button>
            <button
              type="button"
              className="conv-menu-item"
              onClick={() => {
                setGroupModalConvId(menuConvId);
                setMenuConvId(null);
              }}
            >
              <span className="cmi-icon"><Icon name="folder" size={14} /></span>
              <span className="cmi-label">Move to group</span>
            </button>
            <button
              type="button"
              className="conv-menu-item"
              onClick={() => {
                const conv = conversations.find((c) => c.id === menuConvId);
                setMenuConvId(null);
                if (conv) beginRenameConv(conv);
              }}
            >
              <span className="cmi-icon"><Icon name="edit" size={14} /></span>
              <span className="cmi-label">Rename</span>
            </button>
            <div className="conv-menu-divider" />
            <button
              type="button"
              className="conv-menu-item cmi-danger"
              onClick={() => {
                const conv = conversations.find((c) => c.id === menuConvId);
                setMenuConvId(null);
                if (conv) setDeleteConv(conv);
              }}
            >
              <span className="cmi-icon"><Icon name="trash" size={14} /></span>
              <span className="cmi-label">Delete</span>
            </button>
          </div>
        )}

        <section className="chat-main">
          <header className="chat-main-header">
            {/* Only show when conv-panel is collapsed */}
            {!conversationsOpen && (
              <>
                <button
                  type="button"
                  className="chat-corner-toggle-btn"
                  onClick={() => window.dispatchEvent(new CustomEvent("synapse:toggle-app-sidebar"))}
                  aria-label="Open main navigation"
                  title="Open main navigation"
                >
                  <Icon name="menu" size={16} />
                </button>
                <button
                  type="button"
                  className="chat-corner-toggle-btn"
                  onClick={() => setConversationsOpen(true)}
                  aria-label="Show chat history"
                  title="Show chat history"
                >
                  <Icon name="panelLeft" size={16} />
                </button>
                <button
                  type="button"
                  className="chat-corner-toggle-btn"
                  onClick={() => {
                    setConversationsOpen(true);
                    setIsSearching(true);
                    setTimeout(() => searchInputRef.current?.focus(), 60);
                  }}
                  aria-label="Search chat history"
                  title="Search chat history"
                >
                  <Icon name="search" size={16} />
                </button>
                <button
                  type="button"
                  className="chat-corner-toggle-btn"
                  onClick={startNew}
                  aria-label="New chat"
                  title="New chat"
                >
                  <Icon name="plus" size={16} />
                </button>
              </>
            )}
          </header>

          <Tip
            id={TIP.chatScope}
            title="Scope your answers"
            icon="chat"
          >
            Pick which documents a chat uses with the scope picker — answer
            from your whole library or just one file.
          </Tip>

          {messages.length === 0 ? (
            <div className="chat-notion-empty-wrap">
              <div className="chat-notion-empty">
                <h1 className="chat-notion-title">
                  <img src="/favicon.svg" alt="Synapse" className="chat-greeting-logo" />
                  <span>{timeBlock.message}</span>
                </h1>

                {/* Search in Middle */}
                <div className="chat-empty-composer-wrap">
                  {renderComposerContent()}
                </div>

                {/* Suggested Action Cards Down Below Search */}
                {showSuggestions && (
                  <div className="chat-suggestions-section">
                    <div className="prompt-grid-header">
                      <span className="prompt-grid-label">SUGGESTED STUDY ACTIONS</span>
                      <button
                        type="button"
                        className="prompt-grid-close-btn"
                        onClick={() => setShowSuggestions(false)}
                        title="Dismiss suggestions"
                        aria-label="Dismiss suggestions"
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </div>

                    <div className="prompt-cards-grid">
                      {dynamicSuggestions.map((s) => (
                        <button
                          key={s.cmd}
                          type="button"
                          className="prompt-card"
                          onClick={() => populatePrompt(s.prompt)}
                        >
                          <div className="prompt-card-top">
                            <div className="prompt-card-icon">
                              <Icon name={s.icon} size={15} />
                            </div>
                            <span className="prompt-card-cmd">{s.cmd}</span>
                          </div>
                          <div className="prompt-card-body">
                            <span className="prompt-card-title">{s.title}</span>
                            <span className="prompt-card-desc">{s.desc}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="thread" ref={threadRef} onScroll={handleThreadScroll}>
                {messages.map((m, idx) => {
                  const isStreamingThis = busy && idx === messages.length - 1 && m.role === "assistant";

                  return (
                    <div
                      key={m.id}
                      className={`msg msg-${m.role}${isStreamingThis ? " msg-streaming" : ""}`}
                      style={{ "--i": idx } as CSSProperties}
                    >
                      <div className="msg-body">
                        <div className="msg-header">
                          <span className="msg-sender-label">
                            {m.role === "user" ? "You" : "Synapse"}
                          </span>
                          {m.role === "assistant" &&
                            m.sources.length > 0 &&
                            m.sources[0]?.source_type === "web" && (
                              <span className="web-answer-badge" title="Answer sourced from the web, not your uploaded documents">
                                <Icon name="externalLink" size={11} />
                                Web
                              </span>
                            )}
                        </div>
                        {editingMsg === m.id ? (
                          <div className="msg-edit">
                            <textarea
                              className="input"
                              autoFocus
                              value={msgDraft}
                              onChange={(e) => setMsgDraft(e.target.value)}
                              rows={Math.min(12, Math.max(2, msgDraft.split("\n").length))}
                            />
                            <div className="row" style={{ gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                              <Button variant="ghost" className="btn-sm" onClick={() => setEditingMsg(null)}>
                                Cancel
                              </Button>
                              <Button className="btn-sm" onClick={() => void commitEditMsg(m)}>
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {m.role === "assistant" && m.correction && m.correction.corrections.length > 0 && (
                              <div className="msg-correction-notice" aria-live="polite">
                                <Icon name="search" size={12} className="mcn-icon" />
                                <span>
                                  Searched for{" "}
                                  {m.correction.corrections.map((c, i, arr) => (
                                    <span key={i}>
                                      <strong>&lsquo;{c.corrected}&rsquo;</strong>
                                      {c.original.toLowerCase() !== c.corrected.toLowerCase() ? (
                                        <> instead of &lsquo;{c.original}&rsquo;</>
                                      ) : null}
                                      {i < arr.length - 1 ? ", " : ""}
                                    </span>
                                  ))}
                                </span>
                              </div>
                            )}
                            <div className="msg-bubble">
                              {m.content ? (
                                m.role === "assistant" ? (
                                  <MarkdownContent
                                    isStreaming={isStreamingThis}
                                    sources={m.sources}
                                    onCitationClick={setActiveSource}
                                  >
                                    {m.content}
                                  </MarkdownContent>
                                ) : (
                                  m.content
                                )
                              ) : busy ? (
                                <span className="typing" aria-label="Generating response">
                                  <span className="dot" />
                                  <span className="dot" />
                                  <span className="dot" />
                                </span>
                              ) : (
                                ""
                              )}
                            </div>
                            {m.sources.length > 0 && (
                              <div className="source-chips">
                                {m.sources.map((src, i) =>
                                  src.source_type === "web" ? (
                                    <WebCitationChip
                                      key={i}
                                      source={src}
                                      index={i + 1}
                                    />
                                  ) : (
                                    <CitationChip
                                      key={i}
                                      source={src}
                                      onClick={() => setActiveSource(src)}
                                    />
                                  )
                                )}
                              </div>
                            )}
                          </>
                        )}
                        {editingMsg !== m.id && (
                          <MessageActionToolbar
                            role={m.role}
                            content={m.content}
                            scopeIds={scopeIds}
                            onEdit={m.role === "user" ? () => beginEditMsg(m) : undefined}
                            onDelete={() => void removeMsg(m)}
                            onRegenerate={m.role === "assistant" ? () => regenerateAssistantMessage(idx) : undefined}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="composer-container">
                {showScrollBottom && (
                  <button
                    type="button"
                    className="thread-scroll-bottom-btn"
                    onClick={scrollToBottom}
                    title="Scroll to latest messages"
                    aria-label="Scroll to bottom"
                  >
                    <Icon name="arrowDown" size={15} />
                  </button>
                )}
                {renderComposerContent()}
              </div>
            </>
          )}
        </section>

        {activeSource && (
          <div className="modal-overlay" onClick={() => setActiveSource(null)}>
            <div
              className="modal citation-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Citation source"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-head">
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <Icon name="doc" size={16} />
                  <strong>{activeSource.document_name || "Unknown source"}</strong>
                  {activeSource.page_number && (
                    <span className="badge">p{activeSource.page_number}</span>
                  )}
                </div>
                <button
                  className="icon-btn"
                  aria-label="Close"
                  onClick={() => setActiveSource(null)}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
              <div className="citation-snippet">
                {activeSource.chunk_text}
              </div>
              <div className="modal-foot">
                <Button variant="ghost" onClick={() => setActiveSource(null)}>
                  Close
                </Button>
                <Button onClick={() => navigate("/documents")}>
                  <Icon name="doc" size={14} /> View full document
                </Button>
              </div>
            </div>
          </div>
        )}

        {deleteConv && (
          <Modal
            open={!!deleteConv}
            onClose={() => setDeleteConv(null)}
            title="Delete conversation"
          >
            <p className="muted" style={{ marginTop: 0 }}>
              Delete <strong>{deleteConv.title || "Untitled chat"}</strong>? This
              removes all its messages and cannot be undone.
            </p>
            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={() => setDeleteConv(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void removeConv(deleteConv)}>
                <Icon name="trash" size={14} /> Delete
              </Button>
            </div>
          </Modal>
        )}

        {groupModalConvId && (
          <Modal
            open={!!groupModalConvId}
            title="Move to Group"
            onClose={() => {
              setGroupModalConvId(null);
              setNewGroupName("");
            }}
          >
            <div className="group-modal-body">
              <p className="muted" style={{ marginTop: 0, fontSize: "13px" }}>
                Organize your chats into custom project or study groups:
              </p>

              {convGroupMap[groupModalConvId] && (
                <div className="group-current-box">
                  <span style={{ fontSize: "12.5px" }}>
                    Current group: <strong>{groups.find((g) => g.id === convGroupMap[groupModalConvId])?.name || "Group"}</strong>
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => removeFromGroup(groupModalConvId)}
                  >
                    Remove from group
                  </Button>
                </div>
              )}

              {groups.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
                    Existing Groups:
                  </label>
                  <div className="group-picker-grid">
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        className={`group-pick-item ${convGroupMap[groupModalConvId] === g.id ? "active" : ""}`}
                        onClick={() => moveToExistingGroup(groupModalConvId, g.id)}
                      >
                        <Icon name="folder" size={14} />
                        <span style={{ flex: 1, textAlign: "left" }}>{g.name}</span>
                        {convGroupMap[groupModalConvId] === g.id && <Icon name="check" size={13} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
                  {groups.length > 0 ? "Or create a new group:" : "Create a new group:"}
                </label>
                <div className="row" style={{ gap: 8, marginTop: 4 }}>
                  <input
                    type="text"
                    className="group-create-input"
                    placeholder="e.g. Project Delta, Viva prep..."
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newGroupName.trim()) {
                        createGroupAndMove(groupModalConvId, newGroupName);
                      }
                    }}
                    autoFocus={groups.length === 0}
                  />
                  <Button
                    variant="primary"
                    disabled={!newGroupName.trim()}
                    onClick={() => createGroupAndMove(groupModalConvId, newGroupName)}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </>
  );
}

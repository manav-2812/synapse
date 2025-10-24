import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { chatApi } from "../api/chat";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { BrandLogo } from "../components/ui/BrandLogo";
import { Modal } from "../components/ui/Modal";
import { EmptyState } from "../components/ui/EmptyState";
import { Tip } from "../components/Tip";
import { TIP } from "../components/tips";
import { Skeleton } from "../components/ui/Skeleton";
import { DocumentScopePicker } from "../components/DocumentScopePicker";
import { formatDateTime } from "../lib/format";
import type {
  ConversationListItem,
  SourceResponse,
} from "../types/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceResponse[];
}

export default function Chat() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingConv, setLoadingConv] = useState(true);
  const [activeSource, setActiveSource] = useState<SourceResponse | null>(null);

  const [renamingConv, setRenamingConv] = useState<string | null>(null);
  const [convDraft, setConvDraft] = useState("");
  const [editingMsg, setEditingMsg] = useState<string | null>(null);
  const [msgDraft, setMsgDraft] = useState("");
  const [deleteConv, setDeleteConv] = useState<ConversationListItem | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const streamIdx = useRef<number>(-1);

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function loadConversations() {
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
  }

  async function openConversation(id: string) {
    setActiveId(id);
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
  }

  function startNew() {
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
      toast("error", "Couldn't delete chat", err instanceof ApiError ? err.message : "Please try again.");
      void loadConversations();
    }
  }

  function beginRenameConv(c: ConversationListItem) {
    setRenamingConv(c.id);
    setConvDraft(c.title);
  }

  async function commitRenameConv(id: string) {
    const title = convDraft.trim();
    setRenamingConv(null);
    if (!title) return;
    const prev = conversations.find((c) => c.id === id)?.title;
    if (prev === title) return;
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
    try {
      await chatApi.renameConversation(id, title);
    } catch (err) {
      toast("error", "Couldn't rename", err instanceof ApiError ? err.message : "Please try again.");
      await loadConversations();
    }
  }

  function beginEditMsg(m: ChatMessage) {
    setEditingMsg(m.id);
    setMsgDraft(m.content);
  }

  async function commitEditMsg(m: ChatMessage) {
    const content = msgDraft.trim();
    setEditingMsg(null);
    if (!content || content === m.content) return;
    const prev = m.content;
    setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, content } : x)));
    try {
      await chatApi.updateMessage(activeId!, m.id, content);
    } catch (err) {
      toast("error", "Couldn't edit", err instanceof ApiError ? err.message : "Please try again.");
      setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, content: prev } : x)));
    }
  }

  async function removeMsg(m: ChatMessage) {
    const prev = messages;
    setMessages((ms) => ms.filter((x) => x.id !== m.id));
    try {
      await chatApi.deleteMessage(activeId!, m.id);
    } catch (err) {
      toast("error", "Couldn't delete", err instanceof ApiError ? err.message : "Please try again.");
      setMessages(prev);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const docScope = scopeIds;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      sources: [],
    };
    const assistantMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "",
      sources: [],
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    streamIdx.current = messages.length + 1; // index of assistantMsg after append
    setInput("");
    setBusy(true);

    const patchAssistant = (patch: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((m, i) => (i === streamIdx.current ? { ...m, ...patch } : m)),
      );
    };

    try {
      await chatApi.sendMessage(
        { message: text, conversation_id: activeId, document_scope: docScope },
        {
          onSources: (s: SourceResponse[]) => patchAssistant({ sources: s }),
          onToken: (t: string) =>
            setMessages((prev) =>
              prev.map((m, i) =>
                i === streamIdx.current ? { ...m, content: m.content + t } : m,
              ),
            ),
          onDone: (payload) => {
            if (payload?.conversation_id) {
              setActiveId(payload.conversation_id);
              void loadConversations();
            }
          },
          onError: (e: Error) => {
            toast("error", "Chat error", e.message);
            patchAssistant({ content: `⚠️ ${e.message}` });
          },
        },
      );
    } catch {
      /* onError already handled */
    } finally {
      setBusy(false);
      streamIdx.current = -1;
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <>
      <Tip
        id={TIP.chatScope}
        title="Scope your answers"
        icon="chat"
      >
        Pick which documents a chat uses with the scope picker — answer
        from your whole library or just one file.
      </Tip>
      <div className="chat-layout">
      <aside className="conv-panel">
        <div className="conv-panel-head spread">
          <span>Conversations</span>
          <button className="icon-btn" aria-label="New chat" onClick={startNew}>
            <Icon name="plus" size={16} />
          </button>
        </div>
        {loadingConv ? (
          <div className="stack" style={{ padding: 12, gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height="38px" />
            ))}
          </div>
        ) : (
          <div className="conv-list">
            {conversations.length === 0 && (
              <div className="muted" style={{ padding: 12, fontSize: 13 }}>
                No conversations yet.
              </div>
            )}
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`conv-item ${activeId === c.id ? "active" : ""}`}
              >
                {renamingConv === c.id ? (
                  <input
                    className="input conv-rename-input"
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
                      className="ci-main"
                      onClick={() => void openConversation(c.id)}
                    >
                      <div className="ci-title">{c.title || "Untitled chat"}</div>
                      <div className="ci-sub">
                        {c.message_count} messages · {formatDateTime(c.updated_at.toString())}
                      </div>
                    </button>
                    <button
                      className="icon-btn ci-rename"
                      aria-label={`Rename ${c.title}`}
                      onClick={() => beginRenameConv(c)}
                    >
                      <Icon name="edit" size={14} />
                    </button>
                    <button
                      className="icon-btn ci-del"
                      aria-label={`Delete ${c.title}`}
                      onClick={() => setDeleteConv(c)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </aside>

      <section style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        {messages.length === 0 ? (
          <div style={{ margin: 16, flex: 1 }}>
            <EmptyState
              icon="chat"
              title="Ask anything about your documents."
              hint="Optionally scope the answer to specific document IDs below."
            />
          </div>
        ) : (
          <div className="thread" ref={threadRef}>
            {messages.map((m) => (
              <div key={m.id} className={`msg msg-${m.role}`}>
                <div className="msg-avatar">
                  {m.role === "user" ? "You" : <BrandLogo />}
                </div>
                <div className="msg-body">
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
                      <div className="msg-bubble">
                        {m.content ? (
                          m.content
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
                          {m.sources.map((src, i) => (
                            <button
                              key={i}
                              type="button"
                              className="source-chip"
                              title={src.chunk_text}
                              onClick={() => setActiveSource(src)}
                            >
                              <Icon name="doc" size={12} />
                              <span className="sc-text">
                                {src.document_name || "Unknown source"}
                                {src.page_number ? ` · p${src.page_number}` : ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {editingMsg !== m.id && (
                    <div className="msg-actions">
                      <button
                        className="icon-btn"
                        aria-label="Rename message"
                        title="Rename message"
                        onClick={() => beginEditMsg(m)}
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label="Delete message"
                        title="Delete message"
                        onClick={() => void removeMsg(m)}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="composer">
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="composer-meta">
              <span className="badge hybrid-badge" title="Retrieval blends semantic vector search with BM25 keyword search">
                <Icon name="search" size={12} /> Hybrid search
              </span>
              <DocumentScopePicker value={scopeIds} onChange={setScopeIds} allowUpload />
            </div>
            <textarea
              placeholder="Message Synapse…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              rows={1}
            />
          </div>
          <Button onClick={() => void send()} loading={busy} disabled={!input.trim()}>
            <Icon name="chat" size={16} /> Send
          </Button>
        </div>
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
            removes all its messages and can't be undone.
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
    </div>
    </>
  );
}

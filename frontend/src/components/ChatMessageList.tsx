import type { CSSProperties, RefObject } from "react";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { MarkdownContent } from "./ui/MarkdownContent";
import { CitationChip } from "./CitationChip";
import { WebCitationChip } from "./WebCitationChip";
import { MessageActionToolbar } from "./MessageActionToolbar";
import type { ChatMessage } from "../types/chat";
import type { SourceResponse } from "../types/api";
import type { Dispatch, SetStateAction } from "react";

interface ChatMessageListProps {
  messages: ChatMessage[];
  busy: boolean;

  // Edit mode
  editingMsg: string | null;
  msgDraft: string;
  setEditingMsg: Dispatch<SetStateAction<string | null>>;
  setMsgDraft: Dispatch<SetStateAction<string>>;
  commitEditMsg: (m: ChatMessage) => Promise<void>;

  // Message actions
  removeMsg: (m: ChatMessage) => Promise<void>;
  regenerateAssistantMessage: (idx: number) => void;

  // Citation panel
  setActiveSource: Dispatch<SetStateAction<SourceResponse | null>>;

  // Scope context (forwarded to MessageActionToolbar)
  scopeIds: string[];

  // Scroll
  threadRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}

/**
 * The scrollable thread of chat messages.
 *
 * Extracted verbatim from the `messages.length > 0` branch of Chat.tsx.
 * Zero visual or functional changes — all classNames, aria attributes, and
 * data-testid values are preserved exactly as-is.
 */
export function ChatMessageList({
  messages,
  busy,
  editingMsg,
  msgDraft,
  setEditingMsg,
  setMsgDraft,
  commitEditMsg,
  removeMsg,
  regenerateAssistantMessage,
  setActiveSource,
  scopeIds,
  threadRef,
  onScroll,
}: ChatMessageListProps) {
  return (
    <div className="thread" ref={threadRef} onScroll={onScroll}>
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
                  onDelete={() => void removeMsg(m)}
                  onRegenerate={m.role === "assistant" ? () => regenerateAssistantMessage(idx) : undefined}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useCallback, useRef, useState } from "react";
import { chatApi } from "../api/chat";
import { useToast } from "./useToast";
import type { ChatMessage } from "../types/chat";
import type { ConversationListItem, SourceResponse, QueryCorrectionPayload } from "../types/api";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

interface UseChatStreamParams {
  activeId: string | null;
  setActiveId: Dispatch<SetStateAction<string | null>>;
  scopeIds: string[];
  webMode: boolean;
  insightMode: boolean;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setConversations: Dispatch<SetStateAction<ConversationListItem[]>>;
  loadConversations: () => Promise<void>;
  /** Ref shared with the scroll handler — send() sets it to true so the view
   *  follows the newest response; manual scrolling resets it to false. */
  shouldFollowLatestRef: MutableRefObject<boolean>;
}

/**
 * Encapsulates the SSE send loop and the `busy` loading state.
 *
 * All mutable params are read from a ref snapshot on each invocation, so the
 * returned `send` function is stable across renders and never goes stale.
 */
export function useChatStream(params: UseChatStreamParams) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  // Snapshot all params into a ref so `send` (which is memoised with []) can
  // always read the current values without needing to be re-created.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const busyRef = useRef(false);
  busyRef.current = busy;

  const send = useCallback(async (overrideText?: string) => {
    const {
      activeId,
      setActiveId,
      scopeIds,
      webMode,
      insightMode,
      input,
      setInput,
      setMessages,
      setConversations,
      loadConversations,
      shouldFollowLatestRef,
    } = paramsRef.current;

    const text = (overrideText ?? input).trim();
    if (!text || busyRef.current) return;

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- all deps read via paramsRef

  return { send, busy };
}

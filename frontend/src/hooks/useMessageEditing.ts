import { useState } from "react";
import { chatApi } from "../api/chat";
import { ApiError } from "../api/client";
import { useToast } from "./useToast";
import type { ChatMessage } from "../types/chat";
import type { Dispatch, SetStateAction } from "react";

interface UseMessageEditingParams {
  activeId: string | null;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  busy: boolean;
  send: (overrideText?: string) => Promise<void>;
}

/**
 * Manages the per-message edit mode state and the commit / delete / regenerate
 * actions that operate on the message list.
 */
export function useMessageEditing({
  activeId,
  messages,
  setMessages,
  busy,
  send,
}: UseMessageEditingParams) {
  const { toast } = useToast();
  const [editingMsg, setEditingMsg] = useState<string | null>(null);
  const [msgDraft, setMsgDraft] = useState("");

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

  return {
    editingMsg,
    msgDraft,
    setEditingMsg,
    setMsgDraft,
    commitEditMsg,
    removeMsg,
    regenerateAssistantMessage,
  };
}

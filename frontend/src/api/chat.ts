import { request, getToken, BASE, refreshTokens, clearTokens } from "./client";
import type {
  ChatRequest,
  ChatConversationPayload,
  ChatDonePayload,
  ChatStreamEvent,
  ConversationDetail,
  ConversationListItem,
  ConversationRenameRequest,
  MessageResponse,
  MessageUpdateRequest,
  SourceResponse,
} from "../types/api";

export interface ChatStreamHandlers {
  onStart?: () => void;
  onConversation?: (payload: ChatConversationPayload) => void;
  onToken?: (t: string) => void;
  onSources?: (s: SourceResponse[]) => void;
  onDone?: (payload: ChatDonePayload | null) => void;
  onError?: (e: Error) => void;
}

interface SSEBody {
  error?: { message?: string };
  detail?: string;
  message?: string;
}

function parseEvent(block: string): ChatStreamEvent | null {
  if (!block) return null;
  const lines = block.split("\n");
  let dataLine: string | null = null;
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLine = line.slice(5).replace(/^ /, "");
      break;
    }
  }
  if (dataLine == null) return null;
  try {
    return JSON.parse(dataLine) as ChatStreamEvent;
  } catch {
    return null;
  }
}

export const chatApi = {
  listConversations(): Promise<ConversationListItem[]> {
    return request<ConversationListItem[]>("/chat/conversations");
  },
  getConversation(id: string): Promise<ConversationDetail> {
    return request<ConversationDetail>(`/chat/conversations/${id}`);
  },
  deleteConversation(id: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/chat/conversations/${id}`, {
      method: "DELETE",
    });
  },
  renameConversation(id: string, title: string): Promise<ConversationDetail> {
    return request<ConversationDetail>(`/chat/conversations/${id}`, {
      method: "PATCH",
      body: { title } satisfies ConversationRenameRequest,
    });
  },
  deleteMessage(conversationId: string, messageId: string): Promise<{ message: string }> {
    return request<{ message: string }>(
      `/chat/conversations/${conversationId}/messages/${messageId}`,
      { method: "DELETE" },
    );
  },
  updateMessage(
    conversationId: string,
    messageId: string,
    content: string,
  ): Promise<MessageResponse> {
    return request<MessageResponse>(
      `/chat/conversations/${conversationId}/messages/${messageId}`,
      { method: "PATCH", body: { content } satisfies MessageUpdateRequest },
    );
  },

  /**
   * Send a chat message and stream the SSE response. Returns the done payload
   * (conversation_id / message_id / title) once streaming completes.
   *
   * Unlike request(), this uses raw fetch for streaming. We replicate the
   * 401 → refresh → retry logic here so expired tokens are handled correctly.
   */
  async sendMessage(
    params: ChatRequest,
    handlers: ChatStreamHandlers = {},
  ): Promise<ChatDonePayload | null> {
    const body = {
      message: params.message,
      conversation_id: params.conversation_id || undefined,
      document_scope: params.document_scope || undefined,
    };

    async function doFetch(token: string | null): Promise<Response> {
      return fetch(`${BASE}/chat/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    }

    let res = await doFetch(getToken());

    // 401 → try to refresh once, then retry.
    if (res.status === 401) {
      try {
        const newToken = await refreshTokens();
        res = await doFetch(newToken);
      } catch {
        clearTokens();
        const err = new Error("Session expired. Please sign in again.");
        handlers.onError?.(err);
        throw err;
      }
    }

    if (!res.ok) {
      let msg = `Chat request failed (${res.status})`;
      try {
        const d = (await res.json()) as SSEBody;
        msg = d?.error?.message || d?.detail || d?.message || msg;
      } catch {
        /* ignore */
      }
      const err = new Error(msg);
      handlers.onError?.(err);
      throw err;
    }

    handlers.onStart?.();

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let donePayload: ChatDonePayload | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const ev = parseEvent(rawEvent);
        if (!ev) continue;
        if (ev.type === "conversation") handlers.onConversation?.(ev.value);
        else if (ev.type === "sources") handlers.onSources?.(ev.value);
        else if (ev.type === "token") handlers.onToken?.(ev.value || "");
        else if (ev.type === "done") {
          donePayload = ev.value;
          handlers.onDone?.(donePayload);
        } else if (ev.type === "error") {
          handlers.onError?.(new Error(typeof ev.value === "string" ? ev.value : "Chat stream error"));
        }
      }
    }

    const trailing = parseEvent(buffer.trim());
    if (trailing) {
      if (trailing.type === "conversation") handlers.onConversation?.(trailing.value);
      else if (trailing.type === "sources") handlers.onSources?.(trailing.value);
      else if (trailing.type === "token") handlers.onToken?.(trailing.value || "");
      else if (trailing.type === "done") handlers.onDone?.(trailing.value);
      else if (trailing.type === "error") {
        handlers.onError?.(new Error(typeof trailing.value === "string" ? trailing.value : "Chat stream error"));
      }
    }

    return donePayload;
  },
};

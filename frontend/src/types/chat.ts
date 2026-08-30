import type { SourceResponse, QueryCorrectionPayload } from "./api";

/**
 * A single message in a chat conversation thread.
 * Extracted from Chat.tsx so it can be shared across hooks and sub-components.
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceResponse[];
  correction?: QueryCorrectionPayload;
}

// ---------------------------------------------------------------------------
// Shared domain types for Agent Mobile.
// These mirror the Base44 entity schemas (Conversation, Message, ToolCall).
// ---------------------------------------------------------------------------

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type ToolCallStatus = "running" | "success" | "error";

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  default_model: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  model: string;
  system_prompt: string | null;
  pinned: boolean;
  archived: boolean;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Public URL when the file was uploaded to Base44 Storage. */
  url?: string;
  /** Inline text content for small text files read client-side. */
  text?: string;
}

export interface ToolCallRecord {
  id: string;
  message_id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  status: ToolCallStatus;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  model: string | null;
  attachments: Attachment[];
  token_count: number | null;
  created_at: string;
  /** Hydrated client-side from the tool_calls table. */
  tool_calls?: ToolCallRecord[];
}

// --- Streaming protocol ----------------------------------------------------
// The /api/chat route emits newline-delimited JSON events.

export type ChatStreamEvent =
  | { type: "conversation"; conversationId: string; title: string }
  | { type: "message_start"; messageId: string }
  | { type: "delta"; text: string }
  | { type: "tool_call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; result: unknown; status: ToolCallStatus; error?: string; durationMs: number }
  | { type: "message_end"; messageId: string; content: string }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * How the turn relates to the existing thread:
 *
 * - `send`       — a brand-new user message (the default).
 * - `regenerate` — re-run the model for the last user turn. The previous
 *                  assistant reply is replaced rather than appended to, so
 *                  regenerating never duplicates the user's message.
 * - `edit`       — replace the content of an existing user message, drop
 *                  everything after it, and re-run the model.
 */
export type ChatMode = "send" | "regenerate" | "edit";

export interface ChatRequestBody {
  conversationId?: string;
  message: string;
  model: string;
  attachments?: Attachment[];
  enabledTools?: string[];
  systemPrompt?: string;
  /** Defaults to `send` when omitted. */
  mode?: ChatMode;
  /** Required when `mode` is `edit` — the user message being rewritten. */
  targetMessageId?: string;
}

// --- Export -----------------------------------------------------------------

export type ExportFormat = "markdown" | "json";

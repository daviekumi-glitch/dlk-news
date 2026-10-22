import { FUNCTIONS_ORIGIN } from "./client";
import { getDeviceId } from "./device";
import type { Attachment, Conversation, Message, ToolCallRecord } from "@/lib/types";

// ---------------------------------------------------------------------------
// Data access for guest mode. All reads/writes go through the `agentData`
// backend function, scoped server-side to this device's id (X-Device-Id).
// There are no accounts and no API keys in the browser.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

async function request(op: string, payload: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`${FUNCTIONS_ORIGIN}/functions/agentData`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": getDeviceId() },
    body: JSON.stringify({ op, ...payload }),
  });
  const detail = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(detail?.error ?? `Request failed (HTTP ${res.status})`);
  return detail;
}

export function toConversation(r: any): Conversation {
  return {
    id: r.id,
    user_id: r.device_id ?? "me",
    title: r.title || "New chat",
    model: r.model ?? null,
    system_prompt: r.system_prompt ?? null,
    pinned: Boolean(r.pinned),
    archived: Boolean(r.archived),
    last_message_at: r.last_message_at ?? r.last_at ?? r.updated_date ?? r.created_date,
    created_at: r.created_date,
    updated_at: r.updated_date,
  };
}

export function toMessage(r: any): Message {
  return {
    id: r.id,
    conversation_id: r.conversation_id,
    user_id: "me",
    role: r.role,
    content: r.content ?? "",
    model: r.model ?? null,
    attachments: (r.attachments ?? []) as Attachment[],
    token_count: null,
    created_at: r.created_date,
    tool_calls: (r.tool_calls ?? []).map((c: any) => ({
      id: c.id,
      message_id: c.message_id,
      name: c.name,
      arguments: (c.arguments ?? {}) as Record<string, unknown>,
      result: c.result ?? null,
      status: c.status ?? "success",
      error: c.error || null,
      duration_ms: c.duration_ms ?? null,
      created_at: c.created_date,
    })) as ToolCallRecord[],
  };
}

export async function listConversations(): Promise<Conversation[]> {
  const json = await request("list_conversations");
  return (json?.conversations ?? []).map(toConversation);
}

export async function getConversation(id: string) {
  const json = await request("get_conversation", { id });
  if (!json?.conversation) return null;
  const rows: unknown[] = json.messages ?? [];
  return {
    conversation: toConversation(json.conversation),
    messages: rows
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => toMessage(m)),
  };
}

export async function updateConversation(
  id: string,
  patch: Partial<{ title: string; pinned: boolean; archived: boolean; model: string }>,
) {
  await request("update_conversation", { id, patch });
}

export async function deleteConversation(id: string) {
  await request("delete_conversation", { id });
}

/** Delete one message together with its tool-call records. */
export async function deleteMessage(id: string) {
  await request("delete_message", { id });
}

// --- Storage ----------------------------------------------------------------
export async function uploadAttachment(file: File): Promise<Attachment> {
  const MAX = 10 * 1024 * 1024;
  if (file.size > MAX) throw new Error("File exceeds the 10 MB limit");

  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${FUNCTIONS_ORIGIN}/functions/agentData`, {
    method: "POST",
    headers: { "X-Device-Id": getDeviceId() },
    body: form,
  });
  const detail = (await res.json().catch(() => null)) as
    | { attachment?: Attachment; error?: string }
    | null;
  if (!res.ok || !detail?.attachment) {
    throw new Error(detail?.error ?? `Upload failed (HTTP ${res.status})`);
  }

  const attachment = detail.attachment;
  const isText =
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    /\.(md|txt|csv|json|ts|tsx|js|jsx|py|sql|yml|yaml|toml)$/i.test(file.name);
  if (isText && file.size <= 256 * 1024) attachment.text = await file.text();
  return attachment;
}

// --- Profile / settings (per-device, stored locally) -------------------------
export interface ProfileSettings {
  default_model: string | null;
  system_prompt: string | null;
  display_name: string | null;
}

const SETTINGS_KEY = "am_settings";
const MAX_PROMPT_LENGTH = 8000;

export async function getProfileSettings(): Promise<ProfileSettings> {
  if (typeof window === "undefined") return { default_model: null, system_prompt: null, display_name: null };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const s = raw ? (JSON.parse(raw) as Partial<ProfileSettings>) : {};
    return {
      default_model: s.default_model ?? null,
      system_prompt: s.system_prompt ?? null,
      display_name: s.display_name ?? null,
    };
  } catch {
    return { default_model: null, system_prompt: null, display_name: null };
  }
}

export async function saveProfileSettings(
  patch: Partial<{ default_model: string; system_prompt: string | null }>,
): Promise<void> {
  const current = await getProfileSettings();
  const next: ProfileSettings = {
    ...current,
    ...(patch.default_model !== undefined ? { default_model: patch.default_model } : {}),
    ...(patch.system_prompt !== undefined ? { system_prompt: patch.system_prompt } : {}),
  };
  if (next.system_prompt && next.system_prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Custom instructions must be ${MAX_PROMPT_LENGTH} characters or fewer.`);
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }
}

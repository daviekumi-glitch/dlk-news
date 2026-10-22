import type { Conversation, ExportFormat, Message } from "@/lib/types";
import { formatFullTime, slugify } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Conversation export.
//
// Turns the in-memory thread into a self-contained Markdown document or a
// structured JSON snapshot. Both are generated client-side from messages the
// user already owns, so no extra round trip (and no extra RLS surface) is
// needed.
// ---------------------------------------------------------------------------

export interface ExportBundle {
  filename: string;
  mime: string;
  text: string;
}

/** Human label for the assistant in exported transcripts. */
const ASSISTANT_LABEL = "Agent Mobile";

function attachmentLine(message: Message): string | null {
  if (!message.attachments || message.attachments.length === 0) return null;
  const list = message.attachments
    .map((a) => `${a.mime.startsWith("image/") ? "image" : "file"}: ${a.name}`)
    .join(", ");
  return `_Attachments — ${list}_`;
}

function toolCallLines(message: Message): string[] {
  if (!message.tool_calls || message.tool_calls.length === 0) return [];
  return message.tool_calls.map((call) => {
    const status =
      call.status === "error" ? "failed" : call.status === "running" ? "running" : "ok";
    const timing =
      typeof call.duration_ms === "number" ? ` · ${call.duration_ms}ms` : "";
    return `> tool \`${call.name}\` — ${status}${timing}`;
  });
}

export function conversationToMarkdown(
  conversation: Conversation | null,
  messages: Message[],
): string {
  const title = conversation?.title?.trim() || "Untitled conversation";
  const lines: string[] = [
    `# ${title}`,
    "",
    `> Exported from **Agent Mobile** on ${formatFullTime(new Date().toISOString())}`,
  ];
  if (conversation?.model) lines.push(`> Model: \`${conversation.model}\``);
  lines.push("", "---", "");

  if (messages.length === 0) {
    lines.push("_This conversation has no messages yet._", "");
  }

  for (const message of messages) {
    if (message.role === "system") continue;
    const speaker = message.role === "user" ? "You" : ASSISTANT_LABEL;
    lines.push(`### ${speaker} · ${formatFullTime(message.created_at)}`, "");

    for (const line of toolCallLines(message)) lines.push(line);
    if (toolCallLines(message).length > 0) lines.push("");

    const attachment = attachmentLine(message);
    if (attachment) lines.push(attachment, "");

    lines.push(message.content.trim() || "_(empty)_", "", "---", "");
  }

  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n";
}

export function conversationToJson(
  conversation: Conversation | null,
  messages: Message[],
): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      application: "Agent Mobile",
      version: 1,
      conversation: conversation
        ? {
            id: conversation.id,
            title: conversation.title,
            model: conversation.model,
            created_at: conversation.created_at,
            last_message_at: conversation.last_message_at,
          }
        : null,
      messageCount: messages.length,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        model: m.model,
        created_at: m.created_at,
        attachments: m.attachments ?? [],
        tool_calls: (m.tool_calls ?? []).map((t) => ({
          name: t.name,
          arguments: t.arguments,
          result: t.result,
          status: t.status,
          error: t.error,
          duration_ms: t.duration_ms,
        })),
      })),
    },
    null,
    2,
  );
}

export function buildExport(
  conversation: Conversation | null,
  messages: Message[],
  format: ExportFormat,
): ExportBundle {
  const stem = slugify(conversation?.title ?? "conversation");
  if (format === "json") {
    return {
      filename: `${stem}.json`,
      mime: "application/json",
      text: conversationToJson(conversation, messages),
    };
  }
  return {
    filename: `${stem}.md`,
    mime: "text/markdown",
    text: conversationToMarkdown(conversation, messages),
  };
}

import { describe, expect, it } from "vitest";
import { buildExport, conversationToJson, conversationToMarkdown } from "@/lib/export";
import type { Conversation, Message } from "@/lib/types";

const conversation: Conversation = {
  id: "conv-1",
  user_id: "user-1",
  title: "Quarterly planning",
  model: "gpt-4o-mini",
  system_prompt: null,
  pinned: false,
  archived: false,
  last_message_at: "2026-01-02T03:04:00.000Z",
  created_at: "2026-01-02T03:00:00.000Z",
  updated_at: "2026-01-02T03:04:00.000Z",
};

function message(overrides: Partial<Message>): Message {
  return {
    id: "msg-1",
    conversation_id: "conv-1",
    user_id: "user-1",
    role: "user",
    content: "Hello",
    model: null,
    attachments: [],
    token_count: null,
    created_at: "2026-01-02T03:04:00.000Z",
    ...overrides,
  };
}

const thread: Message[] = [
  message({ id: "m1", role: "user", content: "Plan the quarter" }),
  message({
    id: "m2",
    role: "assistant",
    content: "Here is a plan.",
    model: "gpt-4o-mini",
    tool_calls: [
      {
        id: "t1",
        message_id: "m2",
        name: "web_search",
        arguments: { query: "okr" },
        result: { ok: true },
        status: "success",
        error: null,
        duration_ms: 412,
        created_at: "2026-01-02T03:04:00.000Z",
      },
    ],
  }),
];

describe("conversationToMarkdown", () => {
  it("uses the conversation title as the heading", () => {
    expect(conversationToMarkdown(conversation, thread)).toContain("# Quarterly planning");
  });

  it("labels the two speakers", () => {
    const md = conversationToMarkdown(conversation, thread);
    expect(md).toContain("### You");
    expect(md).toContain("### Agent Mobile");
  });

  it("includes both message bodies", () => {
    const md = conversationToMarkdown(conversation, thread);
    expect(md).toContain("Plan the quarter");
    expect(md).toContain("Here is a plan.");
  });

  it("records tool activity with its timing", () => {
    const md = conversationToMarkdown(conversation, thread);
    expect(md).toContain("tool `web_search`");
    expect(md).toContain("412ms");
  });

  it("skips system messages", () => {
    const md = conversationToMarkdown(conversation, [
      message({ id: "m0", role: "system", content: "SECRET INSTRUCTION" }),
      ...thread,
    ]);
    expect(md).not.toContain("SECRET INSTRUCTION");
  });

  it("handles an empty thread", () => {
    expect(conversationToMarkdown(conversation, [])).toContain("no messages yet");
  });

  it("falls back to a placeholder title", () => {
    expect(conversationToMarkdown(null, [])).toContain("# Untitled conversation");
  });

  it("lists attachments by name", () => {
    const md = conversationToMarkdown(conversation, [
      message({
        attachments: [
          { id: "a1", name: "chart.png", mime: "image/png", size: 10 },
          { id: "a2", name: "notes.md", mime: "text/markdown", size: 20 },
        ],
      }),
    ]);
    expect(md).toContain("image: chart.png");
    expect(md).toContain("file: notes.md");
  });
});

describe("conversationToJson", () => {
  it("produces parseable JSON with a message count", () => {
    const parsed = JSON.parse(conversationToJson(conversation, thread));
    expect(parsed.application).toBe("Agent Mobile");
    expect(parsed.version).toBe(1);
    expect(parsed.messageCount).toBe(2);
    expect(parsed.conversation.title).toBe("Quarterly planning");
  });

  it("keeps tool call detail", () => {
    const parsed = JSON.parse(conversationToJson(conversation, thread));
    expect(parsed.messages[1].tool_calls[0].name).toBe("web_search");
    expect(parsed.messages[1].tool_calls[0].duration_ms).toBe(412);
  });

  it("tolerates a null conversation", () => {
    const parsed = JSON.parse(conversationToJson(null, []));
    expect(parsed.conversation).toBeNull();
  });
});

describe("buildExport", () => {
  it("names the markdown file from the slugified title", () => {
    const bundle = buildExport(conversation, thread, "markdown");
    expect(bundle.filename).toBe("quarterly-planning.md");
    expect(bundle.mime).toBe("text/markdown");
  });

  it("names the json file from the slugified title", () => {
    const bundle = buildExport(conversation, thread, "json");
    expect(bundle.filename).toBe("quarterly-planning.json");
    expect(bundle.mime).toBe("application/json");
    expect(() => JSON.parse(bundle.text)).not.toThrow();
  });

  it("falls back to a generic filename", () => {
    expect(buildExport(null, [], "markdown").filename).toBe("conversation.md");
  });
});

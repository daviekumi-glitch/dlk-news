"use client";

import { create } from "zustand";
import type {
  Attachment,
  ChatMode,
  Conversation,
  Message,
  ToolCallRecord,
} from "@/lib/types";
import { DEFAULT_MODEL } from "@/lib/ai/client";
import * as data from "@/lib/base44/data";
import { streamChat } from "@/lib/base44/stream";

// ---------------------------------------------------------------------------
// Chat store - the single source of truth for the client.
// Streaming updates mutate the in-flight assistant message in place.
// ---------------------------------------------------------------------------

interface SendOptions {
  attachments?: Attachment[];
  /** Defaults to `send`. */
  mode?: ChatMode;
  /** Required when `mode` is `edit`. */
  targetMessageId?: string;
}

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  messages: Message[];
  model: string;
  enabledTools: string[];
  toolsInitialised: boolean;
  isStreaming: boolean;
  error: string | null;
  sidebarOpen: boolean;
  toolsPanelOpen: boolean;
  settingsOpen: boolean;
  /** Conversation-scoped map of variant group id -> chosen answer index. */
  selectedVariants: Record<string, number>;
  abortController: AbortController | null;
  /** True while the realtime socket subscriptions are attached. */
  realtimeLive: boolean;

  // --- actions
  setConversations: (c: Conversation[]) => void;
  upsertConversation: (c: Conversation) => void;
  removeConversation: (id: string) => void;
  setActiveId: (id: string | null) => void;
  setMessages: (m: Message[]) => void;
  setModel: (m: string) => void;
  toggleTool: (name: string) => void;
  setEnabledTools: (names: string[]) => void;
  initEnabledTools: (names: string[]) => void;
  setSidebarOpen: (open: boolean) => void;
  setToolsPanelOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  /** Switch on one or more tools (used by the `/` command palette). */
  enableTools: (names: string[]) => void;
  setVariant: (groupId: string, index: number) => void;
  setError: (e: string | null) => void;
  /** Prompt prefilled by an external page (?q= deep link). */
  prefill: string | null;
  setPrefill: (prefill: string | null) => void;
  consumePrefill: () => string | null;
  /** Keep the app fresh: refetch data when the tab regains focus. Returns a cleanup function. */
  startRealtime: () => () => void;
  stop: () => void;
  reset: () => void;

  loadConversations: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  sendMessage: (text: string, options?: SendOptions | Attachment[]) => Promise<void>;
  regenerate: () => Promise<void>;
  editMessage: (messageId: string, text: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  archiveConversation: (id: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
}

function tempId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * True when a stored assistant message is a leftover placeholder.
 *
 * Regenerating keeps the previous answer as a variant, so the collapsing logic
 * in `src/lib/variants.ts` sees a run of assistant messages. An interrupted turn
 * can leave an empty one behind, which would otherwise be picked as "newest"
 * and shown as a blank bubble. Dropping them here keeps that from happening.
 */
function isUsableAssistant(message: Message): boolean {
  return message.content.trim().length > 0 || (message.tool_calls?.length ?? 0) > 0;
}

/** Accept either the legacy `sendMessage(text, attachments)` or an options bag. */
function normaliseOptions(options?: SendOptions | Attachment[]): SendOptions {
  if (Array.isArray(options)) return { attachments: options };
  return options ?? {};
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  model: DEFAULT_MODEL,
  enabledTools: [],
  toolsInitialised: false,
  isStreaming: false,
  error: null,
  sidebarOpen: false,
  toolsPanelOpen: false,
  settingsOpen: false,
  selectedVariants: {},
  abortController: null,
  realtimeLive: false,

  setConversations: (conversations) => set({ conversations }),

  upsertConversation: (c) =>
    set((s) => {
      const rest = s.conversations.filter((x) => x.id !== c.id);
      return { conversations: [c, ...rest] };
    }),

  removeConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
      messages: s.activeId === id ? [] : s.messages,
    })),

  setActiveId: (activeId) => set({ activeId }),
  setMessages: (messages) => set({ messages }),
  setModel: (model) => set({ model }),
  setEnabledTools: (enabledTools) => set({ enabledTools }),
  toggleTool: (name) =>
    set((s) => ({
      enabledTools: s.enabledTools.includes(name)
        ? s.enabledTools.filter((t) => t !== name)
        : [...s.enabledTools, name],
    })),
  /**
   * Seed the enabled-tool set from the server the FIRST time the tools panel
   * loads. A flag (not `enabledTools.length === 0`) guards this so a user who
   * deliberately switches every tool off does not have them all turned back on
   * the next time the panel opens.
   */
  initEnabledTools: (names) =>
    set((s) => (s.toolsInitialised ? s : { enabledTools: names, toolsInitialised: true })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setToolsPanelOpen: (toolsPanelOpen) => set({ toolsPanelOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  enableTools: (names) =>
    set((s) => ({
      enabledTools: Array.from(new Set([...s.enabledTools, ...names])),
      toolsInitialised: true,
    })),
  setVariant: (groupId, index) =>
    set((s) => ({ selectedVariants: { ...s.selectedVariants, [groupId]: index } })),
  setError: (error) => set({ error }),
  /** Prompt prefilled from an external page (e.g. /tools?… Try it links). */
  prefill: null as string | null,
  setPrefill: (prefill) => set({ prefill }),
  consumePrefill: () => {
    const v = get().prefill;
    if (v) set({ prefill: null });
    return v;
  },

  stop: () => {
    get().abortController?.abort();
    set({ isStreaming: false, abortController: null });
  },

  reset: () =>
    set({
      activeId: null,
      messages: [],
      error: null,
      isStreaming: false,
      abortController: null,
      // Variant selections are conversation-scoped, so they reset with the
      // thread rather than leaking a stale index into the next conversation.
      selectedVariants: {},
    }),

  // --- background sync -----------------------------------------------------
  // The realtime websocket was rejected by the server for this app, so sync
  // opportunistically instead: whenever the tab regains focus (or becomes
  // visible again), refresh the sidebar and the active thread. This keeps the
  // app correct across tabs and devices without sockets or polling costs.
  startRealtime: () => {
    let syncing = false;
    const refresh = () => {
      const { isStreaming, activeId } = get();
      if (isStreaming || syncing || document.visibilityState !== "visible") return;
      syncing = true;
      void get()
        .loadConversations()
        .finally(() => {
          const id = get().activeId;
          if (id && id === activeId) void get().loadConversation(id).catch(() => {});
          syncing = false;
        });
    };
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    set({ realtimeLive: true });
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      set({ realtimeLive: false });
    };
  },

  // --- data loading --------------------------------------------------------
  loadConversations: async () => {
    try {
      set({ conversations: await data.listConversations() });
    } catch {
      /* offline - keep whatever we have */
    }
  },

  loadConversation: async (id) => {
    // A different thread means a different set of variant groups.
    set({ activeId: id, messages: [], error: null, selectedVariants: {} });
    try {
      const json = await data.getConversation(id);
      if (!json) {
        set({ error: "Could not load this conversation." });
        return;
      }
      set({
        messages: json.messages.filter((m) => m.role !== "assistant" || isUsableAssistant(m)),
        model: json.conversation?.model ?? get().model,
      });
    } catch {
      set({ error: "Could not load this conversation." });
    }
  },

  // --- streaming send ------------------------------------------------------
  sendMessage: async (text, rawOptions) => {
    const trimmed = text.trim();
    const options = normaliseOptions(rawOptions);
    const mode: ChatMode = options.mode ?? "send";
    const attachments = options.attachments ?? [];

    if (!trimmed || get().isStreaming) return;

    const { activeId, model, enabledTools, messages } = get();

    // Regenerate and edit replay an existing turn, so they need a conversation.
    if (mode !== "send" && !activeId) return;

    const controller = new AbortController();

    const optimisticUser: Message = {
      id: tempId("user"),
      conversation_id: activeId ?? "pending",
      user_id: "me",
      role: "user",
      content: trimmed,
      model: null,
      attachments,
      token_count: null,
      created_at: new Date().toISOString(),
    };

    const assistantId = tempId("assistant");
    const optimisticAssistant: Message = {
      id: assistantId,
      conversation_id: activeId ?? "pending",
      user_id: "me",
      role: "assistant",
      content: "",
      model,
      attachments: [],
      token_count: null,
      created_at: new Date().toISOString(),
      tool_calls: [],
    };

    // Optimistically reshape the thread per mode so the UI never shows a
    // duplicated user message or a stale reply while the server catches up.
    let baseMessages: Message[];
    if (mode === "regenerate") {
      // Keep the whole thread, including the answer being replaced: it becomes
      // an earlier variant, so the switcher reads "2/2" as soon as the new
      // answer starts streaming rather than only after a reload.
      baseMessages = messages;
    } else if (mode === "edit") {
      const targetId = options.targetMessageId;
      const idx = messages.findIndex((m) => m.id === targetId);
      if (idx === -1) return;
      baseMessages = messages.slice(0, idx);
      optimisticUser.id = targetId as string;
    } else {
      baseMessages = messages;
    }

    set(() => ({
      // Regenerate replays an existing user turn, so that user bubble is already
      // in `baseMessages` - appending it again would duplicate it.
      messages: [
        ...baseMessages,
        ...(mode === "regenerate" ? [] : [optimisticUser]),
        optimisticAssistant,
      ],
      isStreaming: true,
      error: null,
      abortController: controller,
    }));

    const patchAssistant = (fn: (m: Message) => Message) =>
      set((s) => ({
        messages: s.messages.map((m) => (m.id === assistantId ? fn(m) : m)),
      }));

    try {
      for await (const event of streamChat(
        {
          conversationId: activeId ?? undefined,
          message: trimmed,
          model,
          attachments,
          enabledTools,
          mode,
          targetMessageId: options.targetMessageId,
        },
        controller.signal,
      )) {
          switch (event.type) {
            case "conversation": {
              set({ activeId: event.conversationId });
              // Reflect the new conversation in the sidebar immediately.
              get().upsertConversation({
                id: event.conversationId,
                user_id: "me",
                title: event.title,
                model,
                system_prompt: null,
                pinned: false,
                archived: false,
                last_message_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
              break;
            }
            case "delta":
              patchAssistant((m) => ({ ...m, content: m.content + event.text }));
              break;
            case "tool_call":
              patchAssistant((m) => ({
                ...m,
                tool_calls: [
                  ...(m.tool_calls ?? []),
                  {
                    id: event.id,
                    message_id: m.id,
                    name: event.name,
                    arguments: event.arguments,
                    result: null,
                    status: "running",
                    error: null,
                    duration_ms: null,
                    created_at: new Date().toISOString(),
                  } satisfies ToolCallRecord,
                ],
              }));
              break;
            case "tool_result":
              patchAssistant((m) => ({
                ...m,
                tool_calls: (m.tool_calls ?? []).map((tc) =>
                  tc.id === event.id
                    ? {
                        ...tc,
                        result: event.result,
                        status: event.status,
                        error: event.error ?? null,
                        duration_ms: event.durationMs,
                      }
                    : tc,
                ),
              }));
              break;
            case "message_end":
              patchAssistant((m) => ({ ...m, id: event.messageId, content: event.content }));
              break;
            case "error":
              set({ error: event.message });
              break;
            case "done":
              break;
          }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        set({ error: err instanceof Error ? err.message : "Something went wrong." });
      }
    } finally {
      // Drop an assistant bubble that never received text or tool activity -
      // otherwise a failed or stopped turn leaves an empty message behind.
      set((s) => ({
        messages: s.messages.filter(
          (m) =>
            m.id !== assistantId ||
            m.content.trim().length > 0 ||
            (m.tool_calls?.length ?? 0) > 0,
        ),
        isStreaming: false,
        abortController: null,
      }));

      // Reload from the server so IDs, ordering and titles are authoritative.
      const convId = get().activeId;
      if (convId) void get().loadConversation(convId);
      void get().loadConversations();
    }
  },

  /** Re-run the model for the last user turn, keeping the previous answer. */
  regenerate: async () => {
    const { messages, isStreaming, activeId } = get();
    if (isStreaming || !activeId) return;

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    await get().sendMessage(lastUser.content, {
      mode: "regenerate",
      attachments: lastUser.attachments ?? [],
    });
  },

  /** Rewrite an existing user message and re-run the model from that point. */
  editMessage: async (messageId, text) => {
    const trimmed = text.trim();
    const { isStreaming } = get();
    if (!trimmed || isStreaming) return;

    await get().sendMessage(trimmed, { mode: "edit", targetMessageId: messageId });
  },

  /** Remove a single message from the thread (optimistic, then persisted). */
  deleteMessage: async (messageId) => {
    set((s) => ({ messages: s.messages.filter((m) => m.id !== messageId) }));
    await data.deleteMessage(messageId).catch(() => set({ error: "Could not delete the message." }));
  },

  // --- mutations -----------------------------------------------------------
  deleteConversation: async (id) => {
    get().removeConversation(id);
    await data.deleteConversation(id).catch(() => set({ error: "Could not delete the conversation." }));
    void get().loadConversations();
  },

  renameConversation: async (id, title) => {
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
    await data.updateConversation(id, { title }).catch(() => set({ error: "Could not rename the conversation." }));
  },

  /**
   * Archive a conversation. The list endpoint excludes archived rows, so the
   * thread disappears from the sidebar immediately but the data is retained.
   */
  archiveConversation: async (id) => {
    get().removeConversation(id);
    await data.updateConversation(id, { archived: true }).catch(() => set({ error: "Could not archive the conversation." }));
    void get().loadConversations();
  },

  togglePin: async (id) => {
    const current = get().conversations.find((c) => c.id === id);
    if (!current) return;
    const pinned = !current.pinned;
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, pinned } : c)),
    }));
    await data.updateConversation(id, { pinned }).catch(() => set({ error: "Could not update the conversation." }));
  },
}));

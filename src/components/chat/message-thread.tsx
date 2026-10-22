"use client";

import * as React from "react";
import { ArrowDown, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { groupAssistantVariants, lastAssistantIndex as lastAssistantIndexIn, visibleMessages } from "@/lib/variants";
import type { Message } from "@/lib/types";

export function MessageThread({
  messages,
  userName,
  isStreaming,
  onRegenerate,
  onEdit,
  onDelete,
  selectedVariants,
  onSelectVariant,
  className,
}: {
  messages: Message[];
  userName?: string | null;
  isStreaming: boolean;
  onRegenerate?: () => void;
  onEdit?: (messageId: string, text: string) => void;
  onDelete?: (messageId: string) => void;
  /** Conversation-scoped map of variant group id -> chosen answer index. */
  selectedVariants?: Record<string, number>;
  onSelectVariant?: (groupId: string, index: number) => void;
  className?: string;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = React.useState(true);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [matchIndex, setMatchIndex] = React.useState(0);

  // Auto-scroll while pinned to the bottom.
  React.useEffect(() => {
    if (!pinned) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pinned]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinned(distance < 80);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setPinned(true);
  };

  // --- Variant collapsing --------------------------------------------------
  // Several answers to one prompt are stored as consecutive assistant messages.
  // Only the selected one is rendered; the switcher on the bubble changes the
  // selection.
  const groups = React.useMemo(() => groupAssistantVariants(messages), [messages]);
  const rendered = React.useMemo(
    () => visibleMessages(messages, selectedVariants ?? {}),
    [messages, selectedVariants],
  );

  // Indexed against `rendered`, not `messages`: collapsing a variant group
  // removes rows, so an index taken from the full array would point at the
  // wrong bubble and attach "regenerate" to an older answer.
  const lastAssistantIndex = React.useMemo(() => lastAssistantIndexIn(rendered), [rendered]);

  const variantInfo = React.useCallback(
    (messageId: string) => {
      for (const [groupId, variants] of groups) {
        const index = variants.findIndex((v) => v.id === messageId);
        if (index === -1) continue;
        return { groupId, index, count: variants.length };
      }
      return null;
    },
    [groups],
  );

  // --- In-conversation search ----------------------------------------------
  const needle = query.trim().toLowerCase();
  const matches = React.useMemo(() => {
    if (!needle) return [];
    return rendered
      .filter((m) => m.role !== "system")
      .filter(
        (m) =>
          m.content.toLowerCase().includes(needle) ||
          (m.tool_calls ?? []).some((t) => t.name.toLowerCase().includes(needle)),
      )
      .map((m) => m.id);
  }, [rendered, needle]);

  // Keep the cursor in range as the result set changes.
  React.useEffect(() => {
    setMatchIndex((i) => (matches.length === 0 ? 0 : Math.min(i, matches.length - 1)));
  }, [matches.length]);

  const activeMatchId = matches[matchIndex];

  React.useEffect(() => {
    if (!activeMatchId) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${activeMatchId}"]`,
    );
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeMatchId]);

  const step = (delta: number) => {
    if (matches.length === 0) return;
    setMatchIndex((i) => (i + delta + matches.length) % matches.length);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
    setMatchIndex(0);
  };

  // Cmd/Ctrl+F focuses the in-conversation search instead of the browser find.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") closeSearch();
    };
    // The composer's `/search` command reaches the same search box through a
    // window event, so the two entry points share one implementation.
    const onOpenSearch = () => setSearchOpen(true);

    window.addEventListener("keydown", onKey);
    window.addEventListener("agent-mobile:open-search", onOpenSearch);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("agent-mobile:open-search", onOpenSearch);
    };
  }, []);

  return (
    <div className={cn("relative flex-1 overflow-hidden", className)}>
      {/* Search bar */}
      {searchOpen && (
        <div className="absolute left-1/2 top-2 z-20 w-[min(92%,26rem)] -translate-x-1/2 animate-fade-in">
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-2 py-1.5 shadow-lg">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  step(e.shiftKey ? -1 : 1);
                }
              }}
              placeholder="Search in conversation"
              className="h-7 flex-1 border-0 bg-transparent p-0 text-xs focus-visible:ring-0"
              autoFocus
              aria-label="Search in conversation"
            />
            <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
              {matches.length === 0 ? "0/0" : `${matchIndex + 1}/${matches.length}`}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => step(-1)}
              disabled={matches.length === 0}
              aria-label="Previous match"
            >
              <ChevronUp className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => step(1)}
              disabled={matches.length === 0}
              aria-label="Next match"
            >
              <ChevronDown className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={closeSearch} aria-label="Close search">
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Search toggle - sits opposite the scroll-to-bottom button */}
      {!searchOpen && messages.length > 3 && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setSearchOpen(true)}
          className="absolute right-3 top-2 z-20 rounded-full border border-border bg-card/90 shadow-sm backdrop-blur"
          aria-label="Search in conversation"
          title="Search in conversation (Cmd+F)"
        >
          <Search className="size-3.5" />
        </Button>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin h-full overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto w-full max-w-3xl py-4">
          {rendered.map((m, i) => {
            const info = m.role === "assistant" ? variantInfo(m.id) : null;
            return (
              <div
                key={m.id}
                data-message-id={m.id}
                className={cn(
                  "transition-colors",
                  needle && m.id === activeMatchId && "bg-brand/8",
                )}
              >
                <MessageBubble
                  message={m}
                  userName={userName}
                  isLast={i === lastAssistantIndex && !isStreaming}
                  isStreaming={isStreaming}
                  onRegenerate={
                    i === lastAssistantIndex && !isStreaming ? onRegenerate : undefined
                  }
                  onEdit={onEdit}
                  onDelete={onDelete}
                  variantIndex={info?.index}
                  variantCount={info?.count}
                  onSelectVariant={
                    info && onSelectVariant
                      ? (index) => onSelectVariant(info.groupId, index)
                      : undefined
                  }
                />
              </div>
            );
          })}
          <div className="h-6" />
        </div>
      </div>

      {!pinned && (
        <Button
          variant="outline"
          size="icon"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-lg"
          aria-label="Scroll to latest"
        >
          <ArrowDown className="size-4" />
        </Button>
      )}
    </div>
  );
}

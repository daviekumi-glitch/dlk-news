"use client";

import * as React from "react";
import {
  Check,
  Copy,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Markdown } from "@/components/chat/markdown";
import { ToolCallCard } from "@/components/chat/tool-call-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatClock, formatFullTime, initials } from "@/lib/utils";
import { VariantSwitcher } from "@/components/chat/variant-switcher";
import type { Message } from "@/lib/types";

function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? "Copied" : "Copy message"}
      title="Copy message"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(content);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

/** Inline editor shown in place of a user bubble while rewriting a prompt. */
function InlineEditor({
  initialValue,
  onCancel,
  onSave,
}: {
  initialValue: string;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = React.useState(initialValue);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, []);

  return (
    <div className="w-full rounded-2xl border border-brand/40 bg-card p-2.5 shadow-sm">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          const el = e.target;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (value.trim()) onSave(value);
          }
        }}
        rows={2}
        className="scrollbar-thin w-full resize-none bg-transparent px-1 py-1 text-[0.9375rem] leading-6 outline-none"
        aria-label="Edit message"
      />
      <div className="mt-1.5 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="brand" size="sm" disabled={!value.trim()} onClick={() => onSave(value)}>
          Update
        </Button>
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  userName,
  isLast,
  isStreaming,
  onRegenerate,
  onEdit,
  onDelete,
  variantIndex,
  variantCount,
  onSelectVariant,
}: {
  message: Message;
  userName?: string | null;
  isLast?: boolean;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onEdit?: (messageId: string, text: string) => void;
  onDelete?: (messageId: string) => void;
  /** Zero-based index of this answer within its variant group. */
  variantIndex?: number;
  /** How many answers exist for this turn (1 = no switcher shown). */
  variantCount?: number;
  onSelectVariant?: (index: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const isUser = message.role === "user";
  const isStreamingEmpty =
    !isUser && message.content === "" && (message.tool_calls?.length ?? 0) === 0;

  // A streaming placeholder has no stable identity yet, so hide destructive
  // actions until the turn is persisted.
  const canAct = !isStreamingEmpty && !message.id.startsWith("assistant_");

  if (isUser) {
    return (
      <div className="group flex animate-bubble-in justify-end gap-3 px-4 py-3 sm:px-6">
        <div className="flex max-w-[85%] flex-col items-end gap-1.5 sm:max-w-[75%]">
          {message.attachments?.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {message.attachments.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-2xs text-muted-foreground"
                >
                  {a.mime.startsWith("image/") ? "Image" : "File"}: {a.name}
                </span>
              ))}
            </div>
          )}

          {editing ? (
            <InlineEditor
              initialValue={message.content}
              onCancel={() => setEditing(false)}
              onSave={(value) => {
                setEditing(false);
                onEdit?.(message.id, value);
              }}
            />
          ) : (
            <div className="brand-gradient animate-bubble-in press rounded-[22px] rounded-br-lg px-4 py-2.5 text-[0.9375rem] leading-7 text-white shadow-lg shadow-brand/25">
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            </div>
          )}

          {!editing && (
            <div
              className={cn(
                "flex items-center gap-0.5 transition-opacity",
                isLast ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
              )}
            >
              <span
                className="mr-1 text-2xs text-muted-foreground tabular-nums"
                title={formatFullTime(message.created_at)}
              >
                {formatClock(message.created_at)}
              </span>
              <CopyMessageButton content={message.content} />
              {onEdit && isLast && !isStreaming && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit message"
                  title="Edit and resend"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="size-3.5" />
                </Button>
              )}
              {onDelete && isLast && !isStreaming && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete message"
                  title="Delete message"
                  onClick={() => onDelete(message.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-2xs font-semibold text-brand elev-1">
          {initials(userName)}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex animate-md-rise gap-3 px-4 py-3 sm:px-6">
      <Logo size={28} className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold">Agent Mobile</span>
          {message.model && <span className="text-2xs text-muted-foreground">{message.model}</span>}
        </div>

        {message.tool_calls?.map((call) => (
          <ToolCallCard key={call.id} call={call} />
        ))}

        {isStreamingEmpty ? (
          <div className="flex items-center gap-1.5 py-1.5" role="status" aria-label="Thinking">
            <span className="size-2 animate-dot-bounce rounded-full bg-brand" />
            <span className="size-2 animate-dot-bounce rounded-full bg-brand [animation-delay:0.15s]" />
            <span className="size-2 animate-dot-bounce rounded-full bg-brand [animation-delay:0.3s]" />
          </div>
        ) : (
          <Markdown content={message.content} />
        )}

        {!isStreamingEmpty && (
          <div
            className={cn(
              "mt-1.5 flex items-center gap-0.5 transition-opacity",
              isLast ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            )}
          >
            <span
              className="mr-1 text-2xs text-muted-foreground tabular-nums"
              title={formatFullTime(message.created_at)}
            >
              {formatClock(message.created_at)}
            </span>
            <CopyMessageButton content={message.content} />
            {variantCount !== undefined && variantCount > 1 && onSelectVariant && (
              <VariantSwitcher
                index={variantIndex ?? variantCount - 1}
                total={variantCount}
                onSelect={onSelectVariant}
                disabled={isStreaming}
                className="ml-0.5"
              />
            )}
            {canAct && onRegenerate && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Regenerate response"
                title="Regenerate response"
                onClick={onRegenerate}
                disabled={isStreaming}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            )}
            {canAct && onDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Message actions">
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => onRegenerate?.()} disabled={isStreaming}>
                    <RefreshCw />
                    Regenerate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(message.id)}
                  >
                    <Trash2 />
                    Delete message
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

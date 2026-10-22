"use client";

import * as React from "react";
import { uploadAttachment } from "@/lib/base44/data";
import { ArrowUp, Loader2, Paperclip, RotateCcw, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/chat/model-picker";
import { useChatStore } from "@/lib/store/chat-store";
import { cn, estimateTokens, formatBytes } from "@/lib/utils";
import type { Attachment } from "@/lib/types";

const MAX_ROWS = 8;
/** Soft warning threshold — the composer nudges, it never blocks. */
const TOKEN_WARN_AT = 6000;

const ACCEPT = [
  "image/*",
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".pdf",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".sql",
  ".yml",
  ".yaml",
  ".toml",
].join(",");

export function Composer() {
  const { sendMessage, isStreaming, stop, model, setModel, error, setError } = useChatStore();
  const [value, setValue] = React.useState("");
  const prefill = useChatStore((s) => s.prefill);

  // A prompt prefilled by an external page (?q= deep link). The shell sets it
  // after this component may already have mounted, so react to the store
  // value instead of reading once on mount.
  React.useEffect(() => {
    if (!prefill) return;
    useChatStore.getState().consumePrefill();
    setValue(prefill);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [prefill]);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dragDepth = React.useRef(0);

  // Auto-grow the textarea.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 24;
    const maxHeight = lineHeight * MAX_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value]);

  const submit = () => {
    if (isStreaming || uploading) return;
    const text = value.trim();
    if (!text && attachments.length === 0) return;
    setValue("");
    setAttachments([]);
    setError(null);
    void sendMessage(text || "(see attached files)", { attachments });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  /** Upload a batch of files, appending each successful one. */
  const uploadFiles = React.useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      try {
        for (const file of files.slice(0, 5)) {
          try {
            const attachment = await uploadAttachment(file);
            setAttachments((prev) => [...prev, attachment]);
          } catch (err) {
            setError(err instanceof Error ? err.message : `Could not upload ${file.name}`);
          }
        }
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [setError],
  );

  // --- Drag and drop -------------------------------------------------------
  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) void uploadFiles(files);
  };

  // --- Paste an image straight into the composer ---------------------------
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    void uploadFiles(files);
  };

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !uploading;
  const approxTokens = estimateTokens(value);
  const tokenWarning = approxTokens >= TOKEN_WARN_AT;

  return (
    <div
      className="relative bg-background/85 px-3 pb-3 pt-4 backdrop-blur-xl sm:px-6 pb-safe"
      style={{ maskImage: "linear-gradient(to bottom, transparent, black 22px)", WebkitMaskImage: "linear-gradient(to bottom, transparent, black 22px)" }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand/50 bg-brand/5 backdrop-blur-sm">
          <p className="text-xs font-medium text-brand">Drop files to attach</p>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl">
        {error && (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2">
            <p className="flex-1 text-xs text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                void useChatStore.getState().regenerate();
              }}
              className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2 py-1 text-2xs font-medium text-destructive transition-all active:scale-95 hover:bg-destructive/15"
            >
              <RotateCcw className="size-3" />
              Retry
            </button>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-destructive/70 hover:text-destructive"
              aria-label="Dismiss error"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-2xs elev-1"
              >
                <span className="max-w-[160px] truncate font-medium">{a.name}</span>
                <span className="text-muted-foreground">{formatBytes(a.size)}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${a.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div
          className={cn(
            "elev-2 flex items-end gap-2 rounded-[26px] border border-border/70 bg-card p-2 transition-all duration-300 focus-within:border-brand/40 focus-within:elev-3 focus-within:shadow-lg focus-within:shadow-brand/10",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept={ACCEPT}
            onChange={(e) => void uploadFiles(Array.from(e.target.files ?? []))}
          />

          <Button
            variant="ghost"
            size="icon-sm"
            className="mb-0.5 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Attach files"
            title="Attach files"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
          </Button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={1}
            placeholder="Message Agent Mobile…"
            className="scrollbar-thin max-h-48 min-h-9 flex-1 resize-none bg-transparent py-2 text-[0.9375rem] leading-6 outline-none placeholder:text-muted-foreground"
            aria-label="Message"
          />

          {isStreaming ? (
            <Button
              variant="secondary"
              size="icon"
              className="press mb-0.5 size-10 shrink-0 rounded-full"
              onClick={stop}
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              variant="brand"
              size="icon"
              className="press glow-brand mb-0.5 size-10 shrink-0 rounded-full transition-all disabled:shadow-none disabled:opacity-40"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
              title="Send message"
            >
              <ArrowUp className="size-5 transition-transform duration-200 group-enabled:group-hover:-translate-y-0.5" />
            </Button>
          )}
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <ModelPicker value={model} onChange={setModel} />
          <div className="flex items-center gap-2">
            {value.length > 0 && (
              <span
                className={cn(
                  "text-2xs tabular-nums",
                  tokenWarning ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                )}
                title={
                  tokenWarning
                    ? "This prompt is very long — the model may truncate the context."
                    : "Rough token estimate"
                }
              >
                ≈{approxTokens.toLocaleString()} tokens
              </span>
            )}
            <p className="hidden text-2xs text-muted-foreground sm:block">
              Enter to send · Shift+Enter for a new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

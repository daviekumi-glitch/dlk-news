"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ChatGPT-style `‹ 2 / 3 ›` control for switching between answers that were
 * generated for the same prompt. Rendered only when a turn actually has more
 * than one answer, so it costs nothing for the common single-answer case.
 */
export function VariantSwitcher({
  index,
  total,
  onSelect,
  disabled,
  className,
}: {
  /** Zero-based index of the answer currently shown. */
  index: number;
  total: number;
  onSelect: (index: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (total <= 1) return null;

  const position = Math.min(Math.max(index, 0), total - 1) + 1;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-card px-0.5",
        className,
      )}
      role="group"
      aria-label="Response variants"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-6 rounded-full"
        onClick={() => onSelect(index - 1)}
        disabled={disabled || index <= 0}
        aria-label="Previous response"
        title="Previous response"
      >
        <ChevronLeft className="size-3.5" />
      </Button>

      <span
        className="min-w-8 text-center text-2xs tabular-nums text-muted-foreground"
        aria-live="polite"
      >
        {position}/{total}
      </span>

      <Button
        variant="ghost"
        size="icon-sm"
        className="size-6 rounded-full"
        onClick={() => onSelect(index + 1)}
        disabled={disabled || index >= total - 1}
        aria-label="Next response"
        title="Next response"
      >
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  );
}

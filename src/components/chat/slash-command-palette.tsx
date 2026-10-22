"use client";

import * as React from "react";
import {
  Calculator,
  Clock,
  CloudSun,
  Download,
  FileText,
  Globe,
  Image as ImageIcon,
  Plus,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SlashCommand } from "@/lib/commands";

/**
 * Maps the icon names in `src/lib/commands.ts` to components.
 *
 * An explicit map rather than a dynamic lookup: it keeps the command table free
 * of React imports (so it stays unit-testable in a plain Node environment) and
 * lets the bundler tree-shake the icons that are not used.
 */
const ICONS: Record<string, LucideIcon> = {
  Plus,
  Download,
  Search,
  Wrench,
  Globe,
  CloudSun,
  Calculator,
  Terminal,
  Image: ImageIcon,
  FileText,
  Clock,
};

const KIND_LABEL: Record<SlashCommand["kind"], string> = {
  tool: "Tool",
  skill: "Skill",
  action: "Action",
};

/**
 * Keyboard-driven command palette for the composer.
 *
 * Rendered by the composer when the input starts with `/`. It owns nothing but
 * presentation and selection — the composer decides what a chosen command does.
 */
export function SlashCommandPalette({
  commands,
  activeIndex,
  onSelect,
  onHover,
}: {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover: (index: number) => void;
}) {
  const listRef = React.useRef<HTMLUListElement>(null);

  // Keep the highlighted row in view as the user arrows through the list.
  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (commands.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 z-30 mb-2 rounded-xl border border-border bg-popover p-3 shadow-lg">
        <p className="text-xs text-muted-foreground">No matching commands.</p>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Commands
        </span>
        <span className="text-2xs text-muted-foreground">
          ↑↓ to navigate · Enter to run · Esc to close
        </span>
      </div>

      <ul
        ref={listRef}
        role="listbox"
        aria-label="Slash commands"
        className="scrollbar-thin max-h-64 overflow-y-auto py-1"
      >
        {commands.map((command, index) => {
          const Icon = ICONS[command.icon] ?? Wrench;
          const active = index === activeIndex;
          return (
            <li key={command.id} role="option" aria-selected={active}>
              <button
                type="button"
                // `onMouseDown` rather than `onClick`: the palette must react
                // before the textarea loses focus and the input collapses.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(command);
                }}
                onMouseEnter={() => onHover(index)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                  active ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md border",
                    active ? "border-brand/40 bg-brand/10 text-brand" : "border-border text-muted-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[0.8125rem] font-medium">/{command.id}</span>
                    <span className="text-2xs text-muted-foreground">{command.label}</span>
                  </span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {command.description}
                  </span>
                </span>

                <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-2xs text-muted-foreground">
                  {KIND_LABEL[command.kind]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

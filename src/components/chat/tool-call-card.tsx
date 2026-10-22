"use client";

import * as React from "react";
import {
  AlertTriangle,
  Calculator,
  Check,
  ChevronDown,
  Clock,
  CloudSun,
  FileText,
  Globe,
  Image as ImageIcon,
  Loader2,
  Terminal,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ToolCallRecord } from "@/lib/types";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe,
  Terminal,
  Image: ImageIcon,
  FileText,
  Clock,
  Wrench,
  Calculator,
  CloudSun,
};

const LABELS: Record<string, string> = {
  web_search: "Web search",
  run_code: "Run code",
  generate_image: "Generate image",
  read_file: "Read file",
  get_current_time: "Current time",
  calculator: "Calculator",
  get_weather: "Weather",
};

function summariseArgs(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "web_search":
      return String(args.query ?? "");
    case "run_code":
      return String(args.code ?? "").split("\n")[0].slice(0, 80);
    case "generate_image":
      return String(args.prompt ?? "").slice(0, 80);
    case "read_file":
      return String(args.name ?? "");
    case "get_current_time":
      return String(args.timezone ?? "UTC");
    case "calculator":
      return String(args.expression ?? "").slice(0, 80);
    case "get_weather":
      return String(args.location ?? "");
    default:
      return JSON.stringify(args).slice(0, 80);
  }
}

/** Extract an image URL from a generate_image result, if present. */
function imageFromResult(result: unknown): string | null {
  if (result && typeof result === "object" && "url" in result) {
    const url = (result as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return null;
}

export function ToolCallCard({ call }: { call: ToolCallRecord }) {
  const [open, setOpen] = React.useState(false);
  const Icon = ICONS[call.name] ?? Wrench;
  const label = LABELS[call.name] ?? call.name;
  const running = call.status === "running";
  const failed = call.status === "error";
  const imageUrl = imageFromResult(call.result);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "elev-1 my-2 overflow-hidden rounded-2xl border bg-card/70 transition-all",
          failed ? "border-destructive/30" : "border-border/70",
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-xl",
                failed
                  ? "bg-destructive/12 text-destructive"
                  : running
                    ? "bg-brand/12 text-brand"
                    : "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
              )}
            >
              {running ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : failed ? (
                <AlertTriangle className="size-3.5" />
              ) : (
                <Check className="size-3.5" />
              )}
            </span>

            <span className="flex min-w-0 flex-1 items-center gap-2">
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="shrink-0 text-xs font-medium">{label}</span>
              <span className="truncate text-xs text-muted-foreground">
                {summariseArgs(call.name, call.arguments)}
              </span>
            </span>

            {typeof call.duration_ms === "number" && !running && (
              <Badge variant="outline" className="shrink-0 tabular-nums">
                {call.duration_ms}ms
              </Badge>
            )}
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-2.5 border-t border-border px-3 py-3">
            <div>
              <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Arguments
              </p>
              <pre className="scrollbar-thin max-h-40 overflow-auto rounded-lg bg-muted/60 p-2.5 font-mono text-2xs leading-5">
                {JSON.stringify(call.arguments, null, 2)}
              </pre>
            </div>

            {failed && call.error && (
              <div>
                <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-destructive">
                  Error
                </p>
                <p className="rounded-lg bg-destructive/8 p-2.5 text-xs text-destructive">
                  {call.error}
                </p>
              </div>
            )}

            {!failed && call.result !== null && call.result !== undefined && (
              <div>
                <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Result
                </p>
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt="Generated"
                    className="max-h-80 w-auto rounded-lg border border-border"
                  />
                ) : (
                  <pre className="scrollbar-thin max-h-56 overflow-auto rounded-lg bg-muted/60 p-2.5 font-mono text-2xs leading-5">
                    {JSON.stringify(call.result, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

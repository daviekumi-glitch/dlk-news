"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { MODELS } from "@/lib/ai/client";
import { FUNCTIONS_ORIGIN } from "@/lib/base44/client";
import { cn } from "@/lib/utils";

/** Entry from the live /functions/agentModels catalog (both providers). */
interface CatalogModel {
  id: string; // "openrouter:<upstream>" | "nvidia:<upstream>"
  name: string;
  provider: "openrouter" | "nvidia";
  context: number | null;
  free: boolean;
}

const MAX_SHOWN = 25;

function labelFor(id: string): string {
  const known = MODELS.find((m) => m.id === id);
  if (known) return known.label;
  // custom catalog id: show the short upstream name
  const upstream = id.includes(":") ? id.split(":").slice(1).join(":") : id;
  return upstream.split("/").slice(-1)[0].replace(/[-_]/g, " ") || upstream;
}

export function ModelPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const [catalog, setCatalog] = React.useState<CatalogModel[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [query, setQuery] = React.useState("");

  // Fetch the live catalog once, on first open.
  const loadCatalog = React.useCallback(async () => {
    if (catalog || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`${FUNCTIONS_ORIGIN}/functions/agentModels`);
      if (!res.ok) throw new Error("catalog unavailable");
      const data = await res.json();
      setCatalog(Array.isArray(data?.models) ? data.models : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [catalog, loading]);

  const q = query.trim().toLowerCase();
  const matches = React.useMemo(() => {
    if (!catalog || !q) return [];
    return catalog.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)).slice(0, MAX_SHOWN);
  }, [catalog, q]);

  const currentLabel = labelFor(value);

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) void loadCatalog(); }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground", className)}
        >
          <Sparkles className="size-3.5 text-brand" />
          {currentLabel}
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel>Recommended</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MODELS.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onClick={() => onChange(m.id)}
            className="flex-col items-start gap-0.5 py-2.5"
          >
            <span className="flex w-full items-center gap-2">
              <span className="flex-1 text-sm font-medium">{m.label}</span>
              <Badge variant="outline" className="shrink-0">
                {m.context}
              </Badge>
              {m.id === value && <Check className="size-3.5 shrink-0 text-brand" />}
            </span>
            <span className="text-2xs leading-4 text-muted-foreground">
              {m.provider} &middot; {m.description}
            </span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2">
          All models
          {catalog && (
            <Badge variant="outline" className="font-normal">
              {catalog.length.toLocaleString()}
            </Badge>
          )}
          {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        </DropdownMenuLabel>

        <div className="px-2 pb-2 pt-1">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-2.5 py-1.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search both providers…"
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              aria-label="Search all models"
            />
          </div>
        </div>

        {failed && (
          <p className="px-3 pb-2 text-2xs text-muted-foreground">
            Live catalog unavailable right now — recommended models still work.
          </p>
        )}

        {q && matches.length === 0 && !loading && (
          <p className="px-3 pb-2 text-2xs text-muted-foreground">No models match &ldquo;{query}&rdquo;.</p>
        )}

        {matches.map((m) => (
          <DropdownMenuItem key={m.id} onClick={() => onChange(m.id)} className="flex-col items-start gap-0.5 py-2">
            <span className="flex w-full items-center gap-2">
              <span className="flex-1 truncate text-sm font-medium">{m.name}</span>
              {m.free && (
                <Badge variant="success" className="shrink-0">
                  free
                </Badge>
              )}
              {m.id === value && <Check className="size-3.5 shrink-0 text-brand" />}
            </span>
            <span className="text-2xs leading-4 text-muted-foreground">
              {m.provider === "nvidia" ? "NVIDIA NIM" : "OpenRouter"}
              {m.context ? ` · ${Math.round(m.context / 1000)}K context` : ""}
            </span>
          </DropdownMenuItem>
        ))}

        {!q && (
          <p className="px-3 pb-2 pt-1 text-2xs leading-4 text-muted-foreground">
            Type above to search every model on OpenRouter and NVIDIA, then pick it for this chat.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

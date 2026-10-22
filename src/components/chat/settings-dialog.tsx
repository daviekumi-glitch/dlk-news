"use client";

import * as React from "react";
import { getProfileSettings, saveProfileSettings } from "@/lib/base44/data";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MODELS } from "@/lib/ai/client";
import { useChatStore } from "@/lib/store/chat-store";
import { cn } from "@/lib/utils";

/**
 * Per-user preferences: the default model and a standing custom instruction.
 *
 * Both are saved through the user-scoped Base44 backend and read by the chat
 * layer to seed each new turn.
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { model, setModel } = useChatStore();
  const [defaultModel, setDefaultModel] = React.useState(model);
  const [systemPrompt, setSystemPrompt] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Load the saved profile each time the dialog opens, so it always reflects
  // what is actually in the database rather than a stale local guess.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const profile = await getProfileSettings();
        if (cancelled) return;
        setDefaultModel(profile.default_model ?? model);
        setSystemPrompt(profile.system_prompt ?? "");
      } catch {
        if (!cancelled) toast.error("Could not load your settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, model]);

  const save = async () => {
    setSaving(true);
    try {
      await saveProfileSettings({
        default_model: defaultModel,
        // An empty textarea clears the custom instruction so the app default applies again.
        system_prompt: systemPrompt.trim() ? systemPrompt : null,
      });

      // Applying the saved model immediately means the picker and the next
      // request agree without a reload.
      setModel(defaultModel);
      toast.success("Settings saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Preferences saved to your account and applied to every new conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <section className="space-y-2">
            <label htmlFor="default-model" className="text-xs font-medium">
              Default model
            </label>
            <select
              id="default-model"
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              disabled={loading}
              className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-sm outline-none focus:border-brand/50 disabled:opacity-50"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="text-2xs leading-4 text-muted-foreground">
              Used whenever a conversation has no model of its own.
            </p>
          </section>

          <section className="space-y-2">
            <label htmlFor="system-prompt" className="text-xs font-medium">
              Custom instruction
            </label>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              disabled={loading}
              rows={6}
              placeholder="e.g. Answer concisely. Prefer TypeScript examples. Always cite sources for factual claims."
              className={cn(
                "scrollbar-thin w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm leading-6",
                "outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/50 disabled:opacity-50",
              )}
            />
            <p className="text-2xs leading-4 text-muted-foreground">
              Prepended to every turn. Leave empty to use the built-in default. {" "}
              <span className="tabular-nums">{systemPrompt.length.toLocaleString()}/8,000</span>
            </p>
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="brand" onClick={() => void save()} disabled={saving || loading}>
            {saving ? "Saving\u2026" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

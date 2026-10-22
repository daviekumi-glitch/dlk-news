"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { Wordmark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useChatStore } from "@/lib/store/chat-store";
import { cn, relativeTime, timeBucket } from "@/lib/utils";
import type { Conversation } from "@/lib/types";

const BUCKET_ORDER = ["Pinned", "Today", "Yesterday", "Previous 7 days", "Older"] as const;

export function Sidebar() {
  const router = useRouter();
  const {
    conversations,
    activeId,
    sidebarOpen,
    setSidebarOpen,
    loadConversation,
    deleteConversation,
    renameConversation,
    togglePin,
    archiveConversation,
    reset,
  } = useChatStore();

  const [query, setQuery] = React.useState("");
  const [renaming, setRenaming] = React.useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleting, setDeleting] = React.useState<Conversation | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, Conversation[]>();
    for (const c of filtered) {
      const key = c.pinned ? "Pinned" : timeBucket(c.last_message_at);
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({
      bucket: b,
      items: map.get(b)!,
    }));
  }, [filtered]);

  const startNewChat = () => {
    reset();
    setSidebarOpen(false);
  };

  const openConversation = (id: string) => {
    void loadConversation(id);
    setSidebarOpen(false);
  };

  return (
    <>
      {/* Mobile scrim */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:static md:z-auto md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3">
          <Wordmark />
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* New chat */}
        <div className="px-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 border-sidebar-border bg-background/60 hover:bg-sidebar-accent"
            onClick={startNewChat}
          >
            <MessageSquarePlus className="size-4" />
            New chat
          </Button>
        </div>

        {/* Search */}
        <div className="relative px-3 pt-3">
          <Search className="pointer-events-none absolute left-6 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-8 border-sidebar-border bg-background/60 pl-8 text-xs"
          />
        </div>

        {/* Conversation list */}
        <div className="scrollbar-thin mt-2 flex-1 overflow-y-auto px-2 pb-2">
          {grouped.length === 0 ? (
            <div className="mx-1 mt-6 rounded-xl border border-dashed border-sidebar-border px-4 py-6 text-center">
              <p className="text-xs font-medium">
                {query ? "No matching chats" : "No conversations yet"}
              </p>
              <p className="mt-1 text-2xs leading-5 text-muted-foreground">
                {query
                  ? "Try a different search term."
                  : "Start a new chat and it will show up here."}
              </p>
            </div>
          ) : (
            grouped.map(({ bucket, items }) => (
              <div key={bucket} className="mb-2">
                <p className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {bucket}
                </p>
                <ul className="space-y-0.5">
                  {items.map((c) => (
                    <li key={c.id}>
                      <div
                        className={cn(
                          "group/item press flex items-center gap-1 rounded-xl px-2.5 py-2 transition-colors",
                          activeId === c.id
                            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                            : "hover:bg-sidebar-accent/60",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => openConversation(c.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="flex items-center gap-1.5">
                            {c.pinned && <Pin className="size-3 shrink-0 text-brand" />}
                            <span className="truncate text-[0.8125rem] font-medium">
                              {c.title}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-2xs text-muted-foreground">
                            {relativeTime(c.last_message_at)}
                          </span>
                        </button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="shrink-0 opacity-0 transition-opacity group-hover/item:opacity-100 data-[state=open]:opacity-100"
                              aria-label="Chat options"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              onClick={() => {
                                setRenaming(c);
                                setRenameValue(c.title);
                              }}
                            >
                              <Pencil />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void togglePin(c.id)}>
                              {c.pinned ? <PinOff /> : <Pin />}
                              {c.pinned ? "Unpin" : "Pin"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void archiveConversation(c.id)}>
                              <Archive />
                              Archive
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleting(c)}
                            >
                              <Trash2 />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Explore links to the content pages */}
        <div className="grid grid-cols-2 gap-1 px-3 pt-3">
          {[
            { href: "/tools", label: "Tools" },
            { href: "/skills", label: "Skills" },
            { href: "/about", label: "About" },
            { href: "/settings", label: "Settings" },
          ].map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="press rounded-xl px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            >
              {n.label}
            </Link>
          ))}
        </div>

        {/* Footer (guest mode: settings + theme, no account) */}
        <div className="flex items-center gap-2 px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">Guest mode</p>
            <p className="truncate text-2xs text-muted-foreground">
              Chats stay on this device
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => router.push("/settings")}
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="size-4" />
          </Button>
          <ThemeToggle />
        </div>
      </aside>

      {/* Rename dialog */}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
            <DialogDescription>Give this conversation a clearer name.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renaming) {
                void renameConversation(renaming.id, renameValue);
                setRenaming(null);
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renaming) void renameConversation(renaming.id, renameValue);
                setRenaming(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>
              “{deleting?.title}” and all of its messages will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) void deleteConversation(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

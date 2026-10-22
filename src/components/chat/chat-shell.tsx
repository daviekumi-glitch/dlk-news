"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Settings,
  Download,
  FileJson,
  FileText,
  Menu,
  MoreVertical,
  PanelRight,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Composer } from "@/components/chat/composer";
import { EmptyState } from "@/components/chat/empty-state";
import { MessageThread } from "@/components/chat/message-thread";
import { Sidebar } from "@/components/chat/sidebar";
import { ToolsPanel } from "@/components/chat/tools-panel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildExport } from "@/lib/export";
import { downloadText } from "@/lib/utils";
import { useChatStore } from "@/lib/store/chat-store";

export function ChatShell() {
  const {
    messages,
    isStreaming,
    loadConversations,
    startRealtime,
    setSidebarOpen,
    setToolsPanelOpen,
    toolsPanelOpen,
    reset,
    regenerate,
    editMessage,
    deleteMessage,
    conversations,
    activeId,
    setPrefill,
  } = useChatStore();
  const router = useRouter();

  // Pages like /tools and /skills deep-link into the composer with ?q=
  // (read imperatively: useSearchParams() would force a Suspense boundary)
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      setPrefill(q.slice(0, 2000));
      // Clean the URL without reloading.
      window.history.replaceState(null, "", `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat`);
    }
  }, [setPrefill]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const activeTitle = activeConversation?.title ?? "New chat";

  React.useEffect(() => {
    void loadConversations();
    // Live sync: chats created/renamed/pinned/deleted on any device show up here.
    const stop = startRealtime();
    return stop;
  }, [loadConversations, startRealtime]);

  const exportConversation = (format: "markdown" | "json") => {
    if (messages.length === 0) {
      toast.error("Nothing to export yet.");
      return;
    }
    const bundle = buildExport(activeConversation, messages, format);
    downloadText(bundle.filename, bundle.text, bundle.mime);
    toast.success(`Exported ${bundle.filename}`);
  };

  const copyTranscript = async () => {
    if (messages.length === 0) {
      toast.error("Nothing to copy yet.");
      return;
    }
    const { text } = buildExport(activeConversation, messages, "markdown");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Transcript copied as Markdown");
    } catch {
      toast.error("Clipboard unavailable in this browser.");
    }
  };

  const hasThread = messages.length > 0;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="size-4" />
          </Button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{activeTitle}</p>
          </div>

          {hasThread && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Conversation actions">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Export conversation</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => exportConversation("markdown")}>
                  <FileText />
                  Download as Markdown
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportConversation("json")}>
                  <FileJson />
                  Download as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void copyTranscript()}>
                  <Download />
                  Copy transcript
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              reset();
            }}
            aria-label="New chat"
            title="New chat"
          >
            <Plus className="size-4" />
          </Button>

          <Button
            variant={toolsPanelOpen ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setToolsPanelOpen(!toolsPanelOpen)}
            aria-label="Toggle tools panel"
            title="Skills & tools"
          >
            <PanelRight className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => router.push("/settings")}
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="size-4" />
          </Button>
        </header>

        {/* Thread / empty state */}
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <MessageThread
            messages={messages}
            userName="You"
            isStreaming={isStreaming}
            onRegenerate={() => void regenerate()}
            onEdit={(id, text) => void editMessage(id, text)}
            onDelete={(id) => void deleteMessage(id)}
          />
        )}

        <ToolsPanel />
        <Composer />
      </div>
    </div>
  );
}

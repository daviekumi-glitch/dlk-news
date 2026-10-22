"use client";

import * as React from "react";
import { CloudSun, Clock, Code2, FileText, Globe, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { useChatStore } from "@/lib/store/chat-store";

// Suggestions map 1:1 to the tools the backend actually ships: web_search,
// get_weather, calculator and read_file. Never advertise capabilities the app
// does not have.
const SUGGESTIONS = [
  {
    icon: Globe,
    title: "Research something current",
    prompt: "Search the web for today's top technology headlines and summarise the three most important.",
  },
  {
    icon: CloudSun,
    title: "Check the weather",
    prompt: "What's the weather in Blantyre, Malawi right now?",
  },
  {
    icon: Code2,
    title: "Do exact math",
    prompt: "Calculate (1250 * 1.18) / 3 and show the exact result.",
  },
  {
    icon: Clock,
    title: "Work out the time",
    prompt: "What time is it right now in Europe/London?",
  },
  {
    icon: FileText,
    title: "Read an attached file",
    prompt: "Attach a text, code or CSV file and I'll summarise what's inside it.",
  },
];

export function EmptyState() {
  const { sendMessage } = useChatStore();

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl animate-md-rise">
        <div className="flex flex-col items-center text-center">
          <Logo size={52} />
          <h1 className="mt-5 text-display">
            <span className="brand-text-gradient">what can I help with?</span>
          </h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Agent Mobile can search the web, check the weather, do exact math and
            read attached files — with every tool call visible in the conversation.
          </p>
        </div>

        <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
          {SUGGESTIONS.map((s, idx) => (
            <button
              key={s.title}
              type="button"
              onClick={() => void sendMessage(s.prompt)}
              className={`group press lift animate-md-pop ${idx === 1 ? "stagger-1" : idx === 2 ? "stagger-2" : idx === 3 ? "stagger-3" : idx === 4 ? "stagger-4" : "stagger-5"} flex items-start gap-3 rounded-3xl border border-border bg-card/70 p-3.5 text-left elev-1 hover:border-brand/40 hover:bg-card hover:elev-2`}
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-brand/12 text-brand transition-transform group-hover:scale-110">
                <s.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.8125rem] font-semibold">{s.title}</span>
                <span className="mt-0.5 block text-2xs leading-5 text-muted-foreground">
                  {s.prompt}
                </span>
              </span>
            </button>
          ))}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-2xs text-muted-foreground">
          <Sparkles className="size-3 text-brand" />
          Tools are enabled per chat in the Skills &amp; tools panel below.
        </p>
      </div>
    </div>
  );
}

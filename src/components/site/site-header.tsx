"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Menu } from "lucide-react";
import { Wordmark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/tools", label: "Tools" },
  { href: "/skills", label: "Skills" },
  { href: "/about", label: "About" },
  { href: "/settings", label: "Settings" },
];

/** Shared glass header for the content pages (About, Tools, Skills, Settings). */
export function SiteHeader() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <header className="glass sticky top-0 z-20 border-b border-border/60">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5">
        <Link href="/" aria-label="Agent Mobile home">
          <Wordmark />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Site">
          {NAV.map((n) => (
            <button
              key={n.href}
              type="button"
              onClick={() => router.push(n.href)}
              className={`press rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                pathname === n.href ? "bg-brand/12 text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="brand" size="sm" className="press hidden rounded-full sm:inline-flex" asChild>
            <Link href="/chat">
              Open chat
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
          {/* Mobile nav */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu className="size-4" />
          </Button>
        </div>
      </div>

      {open && (
        <nav className="animate-md-pop border-t border-border/60 px-5 py-3 md:hidden" aria-label="Site mobile">
          <div className="flex flex-col gap-1">
            {NAV.map((n) => (
              <button
                key={n.href}
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(n.href);
                }}
                className={`press rounded-xl px-3 py-2.5 text-left text-sm font-medium ${
                  pathname === n.href ? "bg-brand/12 text-brand" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {n.label}
              </button>
            ))}
            <Button variant="brand" size="sm" className="press mt-1 rounded-full" asChild>
              <Link href="/chat" onClick={() => setOpen(false)}>
                Open chat
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}

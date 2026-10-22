"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Globe2, Menu, Search, Shield, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = (process.env.NEXT_PUBLIC_BASE44_APP_URL || "https://solene-087bb2e2.base44.app").replace(/\/$/, "");
const CATEGORIES = ["All", "Africa", "World", "Conflict", "Crime", "Investigations"];
type Story = { id: string; title: string; url: string; source: string; publishedAt: string; category: string; summary: string };

function timeAgo(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(value)) / 60000));
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

export default function HomePage() {
  const [stories, setStories] = React.useState<Story[]>([]);
  const [category, setCategory] = React.useState("All");
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [live, setLive] = React.useState(false);

  const load = React.useCallback(async (selected: string) => {
    setLoading(true);
    try {
      const suffix = selected === "All" ? "" : `?category=${encodeURIComponent(selected)}`;
      const response = await fetch(`${API}/functions/newsFeed${suffix}`, { cache: "no-store" });
      if (!response.ok) throw new Error("News feed unavailable");
      const data = await response.json();
      setStories(data.stories ?? []);
      setLive(Boolean(data.live));
    } catch {
      setStories([]);
      setLive(false);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(category); }, [category, load]);
  const filtered = stories.filter((story) => `${story.title} ${story.summary} ${story.source}`.toLowerCase().includes(query.toLowerCase()));
  const lead = filtered[0];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open menu"><Menu className="size-5" /></Button>
          <Link href="/" className="flex items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground shadow-lg">DLK</span><span className="hidden font-semibold tracking-tight sm:inline">D. L. K <span className="text-muted-foreground">News</span></span></Link>
          <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex"><Link className="text-foreground" href="/">Latest</Link><Link className="hover:text-foreground" href="/leaders">Leaders</Link><Link className="hover:text-foreground" href="/countries">Country desks</Link><Link className="hover:text-foreground" href="/about">About</Link></nav>
          <div className="ml-auto flex items-center gap-2"><label className="hidden h-9 items-center gap-2 rounded-full border border-border bg-card px-3 sm:flex"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stories" className="w-32 bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></label><Button variant="brand" size="sm" asChild><Link href="/countries">Explore</Link></Button></div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6 lg:pt-16">
        <div className="max-w-3xl"><Badge variant="brand" className="gap-1.5"><Zap className="size-3" /> Live intelligence desk</Badge><h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">Know what changed.<br /><span className="brand-text-gradient">Know why it matters.</span></h1><p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground">D. L. K brings together sourced breaking news, conflict updates, investigations, country desks and public information without the noise.</p></div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6"><div className="flex items-center gap-2 overflow-x-auto pb-4">{CATEGORIES.map((item) => <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm transition ${category === item ? "bg-primary text-primary-foreground shadow-md" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"}`}>{item}</button>)}</div></section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 pb-16 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
        {loading ? <div className="rounded-3xl border border-border bg-card p-8 text-muted-foreground">Fetching verified headlines…</div> : lead ? <a href={lead.url} target="_blank" rel="noreferrer" className="group rounded-3xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl sm:p-8"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-emerald-500" />{lead.source}<span>·</span>{timeAgo(lead.publishedAt)}</div><h2 className="mt-5 text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">{lead.title}</h2><p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{lead.summary}</p><span className="mt-8 inline-flex items-center gap-1 text-sm font-medium text-primary">Read source <ArrowUpRight className="size-4 transition group-hover:translate-x-1 group-hover:-translate-y-1" /></span></a> : <div className="rounded-3xl border border-dashed border-border p-8 text-muted-foreground">No live stories are available right now. Try again shortly.</div>}
        <div className="grid gap-3">{filtered.slice(1, 5).map((story) => <a key={story.id} href={story.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:bg-accent/30"><div className="text-xs text-muted-foreground">{story.source} · {timeAgo(story.publishedAt)}</div><h3 className="mt-2 font-medium leading-6">{story.title}</h3></a>)}</div>
      </section>

      <section className="border-y border-border bg-card/50"><div className="mx-auto grid max-w-7xl gap-4 px-4 py-10 sm:grid-cols-3 sm:px-6"><div className="flex gap-3"><Globe2 className="mt-1 size-5 text-primary" /><div><h3 className="font-semibold">Malawi-first, global view</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Local context connected to the stories shaping the world.</p></div></div><div className="flex gap-3"><Shield className="mt-1 size-5 text-primary" /><div><h3 className="font-semibold">Source-aware by design</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Every headline links back to its publisher. No anonymous claims.</p></div></div><div className="flex gap-3"><Sparkles className="mt-1 size-5 text-primary" /><div><h3 className="font-semibold">Built for clarity</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Fast feeds now. Search, dossiers and explainers next.</p></div></div></div></section>
      <footer className="mx-auto flex max-w-7xl items-center justify-between px-4 py-8 text-xs text-muted-foreground sm:px-6"><span>© 2026 D. L. K News</span><span>{live ? "Live feed connected" : "Feed reconnecting"}</span></footer>
    </main>
  );
}

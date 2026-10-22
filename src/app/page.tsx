"use client";

import * as React from "react";
import Link from "next/link";
import { BottomNav } from "@/components/site/bottom-nav";
import { ArrowUpRight, Globe2, Menu, RefreshCw, Search, ShieldCheck, Sparkles, X } from "lucide-react";

const API = (process.env.NEXT_PUBLIC_BASE44_APP_URL || "https://solene-087bb2e2.base44.app").replace(/\/$/, "");
const CATEGORIES = ["All", "Africa", "World", "Conflict", "Crime", "Investigations"];
type Story = { id: string; title: string; url: string; source: string; publishedAt: string; category: string; summary: string };

function timeAgo(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(value)) / 60000));
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

function SourceMark({ source }: { source: string }) {
  return <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-black uppercase text-primary">{source.slice(0, 2)}</span>;
}


export default function HomePage() {
  const [stories, setStories] = React.useState<Story[]>([]);
  const [category, setCategory] = React.useState("All");
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [live, setLive] = React.useState(false);
  const [error, setError] = React.useState("");
  const [menuOpen, setMenuOpen] = React.useState(false);

  const load = React.useCallback(async (selected: string, manual = false) => {
    manual ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const suffix = selected === "All" ? "" : `?category=${encodeURIComponent(selected)}`;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      const response = await fetch(`${API}/functions/newsFeed${suffix}`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
      window.clearTimeout(timeout);
      if (!response.ok) throw new Error("The live desk is temporarily unavailable.");
      const data = await response.json() as { stories?: Story[]; live?: boolean };
      const nextStories = Array.isArray(data.stories) ? data.stories : [];
      setStories(nextStories);
      setLive(Boolean(data.live));
      window.localStorage.setItem("dlk:last-feed", JSON.stringify({ stories: nextStories, savedAt: Date.now() }));
    } catch (cause) {
      const cached = window.localStorage.getItem("dlk:last-feed");
      if (cached) {
        try { const parsed = JSON.parse(cached) as { stories?: Story[] }; setStories(parsed.stories ?? []); setError("Showing the last verified feed while we reconnect."); } catch { setError("The live desk is temporarily unavailable."); }
      } else setError(cause instanceof Error && cause.name === "AbortError" ? "The newsroom is taking longer than usual. Try again." : "The live desk is temporarily unavailable.");
      setLive(false);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  React.useEffect(() => { void load(category); }, [category, load]);
  const filtered = stories.filter((story) => `${story.title} ${story.summary} ${story.source}`.toLowerCase().includes(query.toLowerCase()));
  const lead = filtered[0];
  const sources = new Set(filtered.map((story) => story.source)).size;

  return (
    <main className="min-h-screen overflow-hidden bg-background pb-28 text-foreground md:pb-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[620px] editorial-grid opacity-70" />
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-5 px-4 sm:px-6">
          <button type="button" onClick={() => setMenuOpen((open) => !open)} className="rounded-xl p-2 text-muted-foreground hover:bg-accent md:hidden" aria-label="Toggle navigation">{menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}</button>
          <Link href="/" className="group flex shrink-0 items-center gap-3"><span className="relative flex size-10 items-center justify-center rounded-2xl bg-primary text-[11px] font-black tracking-tight text-primary-foreground shadow-lg shadow-primary/25 transition group-hover:rotate-3">D.L.K</span><span className="hidden text-sm font-bold tracking-tight sm:block">D. L. K <span className="font-normal text-muted-foreground">/ NEWSROOM</span></span></Link>
          <nav className={`${menuOpen ? "absolute inset-x-4 top-[68px] flex flex-col rounded-2xl border border-border bg-card p-3 shadow-2xl md:static md:flex-row md:border-0 md:bg-transparent md:p-0 md:shadow-none" : "hidden md:flex"} items-center gap-1 text-sm font-medium md:ml-6 md:gap-5`}><Link className="w-full rounded-xl px-3 py-2 text-primary md:w-auto md:px-0 md:py-0" href="/">The latest</Link><Link className="w-full rounded-xl px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground md:w-auto md:px-0 md:py-0" href="/countries">Country desks</Link><Link className="w-full rounded-xl px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground md:w-auto md:px-0 md:py-0" href="/leaders">Public leaders</Link><Link className="w-full rounded-xl px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground md:w-auto md:px-0 md:py-0" href="/about">Our standard</Link></nav>
          <div className="ml-auto flex items-center gap-2"><label className="hidden h-10 items-center gap-2 rounded-xl border border-border bg-card/70 px-3 shadow-sm transition focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10 sm:flex"><Search className="size-4 text-muted-foreground" /><input aria-label="Search the newsroom" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the newsroom" className="w-36 bg-transparent text-sm outline-none placeholder:text-muted-foreground lg:w-48" /></label><button type="button" onClick={() => void load(category, true)} className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition hover:border-primary/40 hover:text-primary" aria-label="Refresh headlines"><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /></button></div>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl gap-10 px-4 pb-12 pt-14 sm:px-6 lg:grid-cols-[1fr_360px] lg:items-end lg:pt-20">
        <div><div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-semibold text-primary"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>{live ? "Live newsroom connected" : "Connecting to the newsroom"}</div><h1 className="mt-6 max-w-4xl text-balance text-5xl font-semibold leading-[.98] tracking-[-.055em] sm:text-7xl">Know what changed.<br /><span className="headline-gradient">Know why it matters.</span></h1><p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">A source-first intelligence desk for Malawi, Africa and the world. The signal without the shouting.</p></div>
        <div className="editorial-glow rounded-3xl border border-border bg-card/80 p-5 backdrop-blur-xl"><div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground"><span>Desk status</span><span className="text-emerald-600">Operational</span></div><div className="mt-5 grid grid-cols-3 divide-x divide-border"><div className="px-3 first:pl-0"><p className="text-2xl font-semibold">{loading ? "—" : filtered.length}</p><p className="mt-1 text-xs text-muted-foreground">stories</p></div><div className="px-3"><p className="text-2xl font-semibold">{loading ? "—" : sources}</p><p className="mt-1 text-xs text-muted-foreground">sources</p></div><div className="px-3 last:pr-0"><p className="text-2xl font-semibold">24/7</p><p className="mt-1 text-xs text-muted-foreground">coverage</p></div></div></div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6"><div className="flex items-center gap-2 overflow-x-auto border-b border-border pb-4">{CATEGORIES.map((item) => <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${category === item ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>{item}</button>)}</div></section>

      <section className="relative z-10 mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.45fr_1fr]">
        {error ? <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-8"><p className="font-medium text-destructive">{error}</p><button type="button" onClick={() => void load(category, true)} className="mt-4 rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-white">Try again</button></div> : loading ? <div className="h-80 animate-pulse rounded-3xl bg-muted" /> : lead ? <a href={lead.url} target="_blank" rel="noreferrer" className="group editorial-glow flex min-h-[360px] flex-col justify-between rounded-3xl border border-border bg-card p-6 transition hover:-translate-y-1 sm:p-8"><div><div className="flex items-center gap-3 text-xs font-medium text-muted-foreground"><SourceMark source={lead.source} /><span>{lead.source}</span><span className="text-border">/</span><span>{timeAgo(lead.publishedAt)}</span><span className="ml-auto rounded-full bg-primary/10 px-2 py-1 text-[10px] uppercase tracking-wider text-primary">Lead story</span></div><h2 className="mt-8 max-w-3xl text-3xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">{lead.title}</h2><p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">{lead.summary}</p></div><span className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary">Read the source <ArrowUpRight className="size-4 transition group-hover:translate-x-1 group-hover:-translate-y-1" /></span></a> : <div className="rounded-3xl border border-dashed border-border p-8 text-muted-foreground">No stories match this search yet.</div>}
        <div className="rounded-3xl border border-border bg-card/60 p-4 sm:p-5"><div className="flex items-center justify-between px-2 pb-3"><h2 className="font-semibold">More from the desk</h2><span className="text-xs text-muted-foreground">{filtered.slice(1, 6).length} updates</span></div><div className="divide-y divide-border">{filtered.slice(1, 6).map((story) => <a key={story.id} href={story.url} target="_blank" rel="noreferrer" className="story-rule group block py-4 pl-4 transition first:pt-2 hover:pl-5"><div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"><span>{story.category}</span><span>·</span><span>{timeAgo(story.publishedAt)}</span></div><h3 className="mt-1.5 font-medium leading-6 transition group-hover:text-primary">{story.title}</h3><p className="mt-1 text-xs text-muted-foreground">{story.source}</p></a>)}</div></div>
      </section>

      <section className="relative z-10 border-y border-border bg-card/40"><div className="mx-auto grid max-w-7xl gap-5 px-4 py-10 sm:grid-cols-3 sm:px-6"><div className="rounded-2xl border border-border bg-background/60 p-5"><Globe2 className="size-5 text-primary" /><h3 className="mt-5 font-semibold">Local context, global view</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Malawi first, with the wider African and global picture always in frame.</p></div><div className="rounded-2xl border border-border bg-background/60 p-5"><ShieldCheck className="size-5 text-primary" /><h3 className="mt-5 font-semibold">Evidence over noise</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Stories link back to publishers and public records. Rumor is never presented as fact.</p></div><div className="rounded-2xl border border-border bg-background/60 p-5"><Sparkles className="size-5 text-primary" /><h3 className="mt-5 font-semibold">Built as a newsroom</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Country desks, leader dossiers and explainers are being built on this live foundation.</p></div></div></section>
      <footer className="relative z-10 mx-auto flex max-w-7xl flex-col gap-3 px-4 py-10 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><span className="font-semibold text-foreground">D. L. K</span><span className="mx-2">/</span>News that respects your attention</div><div className="flex items-center gap-4"><Link href="/about" className="hover:text-foreground">Editorial standard</Link><span>{live ? "Live feed connected" : "Feed reconnecting"}</span></div></footer>
      <BottomNav />
    </main>
  );
}

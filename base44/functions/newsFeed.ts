// D. L. K News feed aggregator. Public RSS is fetched server-side so the browser
// never depends on third-party CORS or exposes provider credentials.
type Story = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  category: string;
  summary: string;
};

type Feed = { source: string; url: string; category: string };

let cache: { stories: Story[]; fetchedAt: string; expiresAt: number } | null = null;
const FEEDS: Feed[] = [
  { source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "World" },
  { source: "BBC Africa", url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", category: "Africa" },
  { source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", category: "World" },
];

const decode = (value: string) => value.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const tag = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "");
const clean = (value: string) => value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function loadFeed(feed: Feed): Promise<Story[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(feed.url, { signal: controller.signal, headers: { "User-Agent": "DLK-News/0.1" } });
    if (!response.ok) return [];
    const xml = await response.text();
    return [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)].slice(0, 12).map((match) => {
      const item = match[1];
      const title = clean(tag(item, "title"));
      const url = tag(item, "link") || tag(item, "guid");
      const published = tag(item, "pubDate") || tag(item, "dc:date");
      const summary = clean(tag(item, "description"));
      const id = `${feed.source}:${url || title}`;
      return { id, title, url, source: feed.source, publishedAt: published ? new Date(published).toISOString() : new Date().toISOString(), category: feed.category, summary: summary.slice(0, 280) };
    }).filter((story) => story.title && story.url);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" } });
  const url = new URL(request.url);
  const requestedCategory = url.searchParams.get("category")?.toLowerCase();
  let allStories: Story[];
  let fetchedAt: string;
  if (cache && cache.expiresAt > Date.now()) {
    allStories = cache.stories;
    fetchedAt = cache.fetchedAt;
  } else {
    const results = (await Promise.all(FEEDS.map(loadFeed))).flat();
    allStories = [...new Map(results.map((story) => [story.id, story])).values()]
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, 40);
    fetchedAt = new Date().toISOString();
    cache = { stories: allStories, fetchedAt, expiresAt: Date.now() + 5 * 60 * 1000 };
  }
  const stories = allStories.filter((story) => !requestedCategory || story.category.toLowerCase() === requestedCategory);
  return Response.json({ stories, fetchedAt, sources: FEEDS.length, live: allStories.length > 0 }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } });
});

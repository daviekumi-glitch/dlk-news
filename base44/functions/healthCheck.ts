import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ---------------------------------------------------------------------------
// healthCheck: production health probe for the Agent Mobile backend.
// Called ONLY by the scheduled workflow (every 6 hours).
//
// Probes, with tight timeouts so a dead endpoint cannot stall the workflow:
//   1. The two AI providers in the fallback chain (tiny completion each)
//   2. The upstream APIs the assistant tools depend on (weather, search)
//   3. The latest GitHub release APK download URL
// Returns { healthy, issues, providers, sources, release, checked_at }.
// No secrets appear in the response - only booleans and timings.
// ---------------------------------------------------------------------------

interface Probe { ok: boolean; ms: number; detail: string }

async function probe(label: string, fn: () => Promise<string>): Promise<[string, Probe]> {
  const t = Date.now();
  try {
    const detail = await fn();
    return [label, { ok: true, ms: Date.now() - t, detail }];
  } catch (e) {
    return [label, { ok: false, ms: Date.now() - t, detail: (e as Error).message.slice(0, 120) }];
  }
}

async function tinyCompletion(url: string, key: string, model: string): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'agent-mobile-health/1.0' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: PONG' }], max_tokens: 200 }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!text) throw new Error('empty reply');
    return text.slice(0, 20);
  } finally { clearTimeout(timer); }
}

async function headOk(url: string): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'User-Agent': 'agent-mobile-health/1.0' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return `HTTP ${res.status}`;
  } finally { clearTimeout(timer); }
}

async function releaseOk(): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch('https://api.github.com/repos/daviekumi-glitch/agent-mobile/releases/latest', {
      headers: { 'User-Agent': 'agent-mobile-health/1.0', Accept: 'application/vnd.github+json' },
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
    const rel: any = await res.json();
    const asset = (rel.assets ?? [])[0];
    if (!asset?.browser_download_url) throw new Error('latest release has no APK asset');
    const apk = await fetch(asset.browser_download_url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    if (!apk.ok) throw new Error(`APK HTTP ${apk.status}`);
    return `${rel.tag_name} (${asset.name}, ${Math.round((asset.size ?? 0) / 1e6)}MB)`;
  } finally { clearTimeout(timer); }
}

Deno.serve(async (req) => {
  const base44 = await createClientFromRequest(req);
  // Guest mode: no user accounts exist. The probe is read-only, exposes no
  // secrets (booleans and timings only) and is called by the scheduled
  // workflow; a lightweight gate keeps trivial abuse away.
  const key = (Deno.env.get('HEALTHCHECK_TOKEN') ?? '').trim();
  if (key && (req.headers.get('x-healthcheck-token') ?? '') !== key) {
    return Response.json({ error: 'Not authorized' }, { status: 403 });
  }

  const nvidiaKey = Deno.env.get('NVIDIA_API_KEY');
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');

  const pairs = await Promise.all([
    probe('nemotron-3.5-super-vl (OpenRouter)', () =>
      openrouterKey ? tinyCompletion('https://openrouter.ai/api/v1/chat/completions', openrouterKey, 'nvidia/nemotron-3.5-super-vl:free') : Promise.reject(new Error('OPENROUTER_API_KEY missing'))),
    probe('minimax-m3.1-flash (OpenRouter)', () =>
      openrouterKey ? tinyCompletion('https://openrouter.ai/api/v1/chat/completions', openrouterKey, 'minimax/minimax-m3.1-flash:free') : Promise.reject(new Error('OPENROUTER_API_KEY missing'))),
    probe('nemotron-3-ultra (OpenRouter)', () =>
      openrouterKey ? tinyCompletion('https://openrouter.ai/api/v1/chat/completions', openrouterKey, 'nvidia/nemotron-3-ultra-550b-a55b:free') : Promise.reject(new Error('OPENROUTER_API_KEY missing'))),
    probe('gemma-4-31b (OpenRouter)', () =>
      openrouterKey ? tinyCompletion('https://openrouter.ai/api/v1/chat/completions', openrouterKey, 'google/gemma-4-31b-it:free') : Promise.reject(new Error('OPENROUTER_API_KEY missing'))),
    probe('gpt-oss-20b (NVIDIA)', () =>
      nvidiaKey ? tinyCompletion('https://integrate.api.nvidia.com/v1/chat/completions', nvidiaKey, 'openai/gpt-oss-20b') : Promise.reject(new Error('NVIDIA_API_KEY missing'))),
    probe('weather source (wttr.in)', () => headOk('https://wttr.in/Blantyre?format=j1')),
    probe('search source (Wikipedia)', () => headOk('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=malawi&format=json&origin=*')),
    probe('search source (DuckDuckGo)', () => headOk('https://api.duckduckgo.com/?q=malawi&format=json&no_html=1')),
    probe('GitHub release APK', () => releaseOk()),
  ]);

  const providers = Object.fromEntries(pairs.filter(([k]) => k.includes('(') && (k.includes('NVIDIA') || k.includes('OpenRouter'))));
  const sources = Object.fromEntries(pairs.filter(([k]) => k.startsWith('weather') || k.startsWith('search')));
  const release = Object.fromEntries(pairs.filter(([k]) => k.startsWith('GitHub')));

  // Healthy = at least one chat model on OpenRouter answered. NVIDIA-direct is
  // informational (it intermittently hangs from this runtime); the search and
  // weather tools degrade gracefully, so they do not fail the check.
  const orOk = ['nemotron-3.5-super-vl (OpenRouter)', 'minimax-m3.1-flash (OpenRouter)', 'nemotron-3-ultra (OpenRouter)', 'gemma-4-31b (OpenRouter)']
    .some((k) => (providers as any)[k]?.ok === true);
  const aiOk = orOk;
  // At least one search source must work; weather has its own fallback.
  const searchOk = (sources['search source (Wikipedia)'] as any)?.ok === true ||
    (sources['search source (DuckDuckGo)'] as any)?.ok === true;
  const issues = pairs.filter(([, p]) => !p.ok).map(([k, p]) => `${k}: ${p.detail}`);

  return Response.json({
    healthy: aiOk && searchOk,
    ai_ok: aiOk,
    search_ok: searchOk,
    issues,
    providers,
    sources,
    release,
    checked_at: new Date().toISOString(),
  });
});

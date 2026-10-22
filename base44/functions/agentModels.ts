// ---------------------------------------------------------------------------
// agentModels: live model catalog from BOTH providers.
//
// Aggregates the full public catalog of OpenRouter and NVIDIA NIM (using the
// backend NVIDIA key) so the client can offer every available model, not just
// the curated verified five. Responses are cached in-process for one hour to
// stay friendly to the upstream APIs. No API keys ever leave this function.
//
// Guest mode: no auth. The catalog contains no user data, so no device scoping
// is needed. CORS is open for the app origins.
// ---------------------------------------------------------------------------

const TTL_MS = 60 * 60 * 1000;
const MAX_MODELS_PER_PROVIDER = 400;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

let cache: { at: number; body: unknown } | null = null;

interface CatalogEntry {
  id: string;
  name: string;
  provider: "openrouter" | "nvidia";
  upstream: string;
  context: number | null;
  free: boolean;
  description: string;
}

async function fetchOpenRouter(): Promise<CatalogEntry[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`OpenRouter catalog HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.slice(0, MAX_MODELS_PER_PROVIDER).map((m: any) => ({
    id: `openrouter:${m.id}`,
    name: String(m.name ?? m.id ?? "").trim() || m.id,
    provider: "openrouter" as const,
    upstream: String(m.id),
    context: typeof m.context_length === "number" ? m.context_length : null,
    free: String(m.pricing?.prompt ?? "1") === "0" && String(m.pricing?.completion ?? "1") === "0",
    description: String(m.description ?? "").slice(0, 160),
  }));
}

async function fetchNvidia(): Promise<CatalogEntry[]> {
  const key = Deno.env.get("NVIDIA_API_KEY");
  if (!key) throw new Error("NVIDIA key not configured");
  const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`NVIDIA catalog HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.slice(0, MAX_MODELS_PER_PROVIDER).map((m: any) => {
    const id = String(m.id ?? "");
    const short = id.includes("/") ? id.split("/").slice(1).join("/") : id;
    return {
      id: `nvidia:${id}`,
      name: short || id,
      provider: "nvidia" as const,
      upstream: id,
      context: typeof m.max_model_len === "number" ? m.max_model_len : null,
      free: true, // NIM endpoints under this key are metered by the key, not per token
      description: "Served directly by NVIDIA NIM.",
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (cache && Date.now() - cache.at < TTL_MS) {
    return Response.json(cache.body, { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
  }

  const [or, nv] = await Promise.allSettled([fetchOpenRouter(), fetchNvidia()]);
  const models: CatalogEntry[] = [
    ...(or.status === "fulfilled" ? or.value : []),
    ...(nv.status === "fulfilled" ? nv.value : []),
  ];
  // Stable order: provider then name.
  models.sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));

  const body = {
    count: models.length,
    sources: {
      openrouter: or.status === "fulfilled" ? "ok" : "unavailable",
      nvidia: nv.status === "fulfilled" ? "ok" : "unavailable",
    },
    models,
    fetched_at: new Date().toISOString(),
  };
  if (models.length > 0) cache = { at: Date.now(), body };
  return Response.json(body, { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
});

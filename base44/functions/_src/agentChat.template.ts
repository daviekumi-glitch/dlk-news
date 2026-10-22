import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ---------------------------------------------------------------------------
// agentChat: streaming chat endpoint with tool use. GUEST MODE - no accounts.
//
// Every browser generates a random device id on first visit and sends it as
// the X-Device-Id header. Conversations are owned by that device id; all
// entity reads/writes are checked against it server-side (service role).
//
// AI providers: NVIDIA NIM and OpenRouter, called directly with API keys held
// ONLY as backend secrets. An ordered fallback chain retries on 429 / 5xx /
// timeout / empty output so a single flaky provider does not fail a turn.
//
// Protocol: newline-delimited JSON events:
//   conversation | message_start | delta | tool_call | tool_result |
//   message_end | error | done
// ---------------------------------------------------------------------------

type Provider = 'nvidia' | 'openrouter';
interface ModelDef { id: string; provider: Provider; upstream: string; label: string }

// Only models verified to answer with this key set. Order = fallback order.
// Diversified 2026-10-21: four OpenRouter free models with separate per-model
// quotas lead; NVIDIA-direct is the last resort while its egress route
// intermittently hangs from this runtime. MiniMax leads: it answers in clean
// conversational Markdown, while the nemotron family leaks native tool markup.
const MODELS: ModelDef[] = [
  { id: 'minimax-flash', provider: 'openrouter', upstream: 'minimax/minimax-m3.1-flash:free', label: 'MiniMax M3.1 Flash' },
  { id: 'nemotron-svl', provider: 'openrouter', upstream: 'nvidia/nemotron-3.5-super-vl:free', label: 'Nemotron 3.5 Super VL' },
  { id: 'nemotron-ultra', provider: 'openrouter', upstream: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra 550B' },
  { id: 'gemma-4-31b', provider: 'openrouter', upstream: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B' },
  { id: 'gpt-oss-20b', provider: 'nvidia', upstream: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
];
const DEFAULT_MODEL = 'minimax-flash';

const ENDPOINTS: Record<Provider, { url: string; key: () => string | undefined }> = {
  nvidia: { url: 'https://integrate.api.nvidia.com/v1/chat/completions', key: () => Deno.env.get('NVIDIA_API_KEY') },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', key: () => Deno.env.get('OPENROUTER_API_KEY') },
};

const MAX_TOOL_ITERATIONS = 4;
const HISTORY_LIMIT = 30;
const REQUEST_TIMEOUT_MS = 30000;
const REQUEST_TIMEOUT_STREAM_MS = 20000;
// First content token must arrive fast or we fail over; once tokens flow,
// allow a longer gap between chunks.
const STREAM_FIRST_MS = 6000;
const STREAM_IDLE_MS = 12000;
// Tool decisions are small (1200 tokens); fail over fast instead of hanging 30s.
const TOOL_TIMEOUT_MS = 15000;
// Brief pause between fallback passes (rate limits need a moment, not seconds).
const PASS_DELAY_MS = 600;

const SYSTEM_PROMPT = `You are Agent Mobile, a helpful, precise AI assistant.
- Answer directly and lead with the result. Skip preamble.
- Use GitHub-flavoured Markdown. Put code in fenced blocks with a language tag.
- Write math in plain text (e.g. 1250 * 1.18 / 3 = 491.67). Never use LaTeX.
- When a tool gives a better answer, call it instead of guessing. Never invent tool output, URLs or citations.
- If a tool fails, say so plainly and continue with what you know.
- Be concise by default.`;

type Json = Record<string, unknown>;
interface Attachment { id: string; name: string; mime: string; size: number; url?: string; text?: string }
interface ToolOutcome { ok: boolean; data: unknown; error?: string }
interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }

const TOOL_SPECS: Record<string, { description: string; args: string }> = {
  web_search: { description: 'Search the web for current information.', args: '{"query": string}' },
  get_weather: { description: 'Current weather for a city.', args: '{"location": string, "units"?: "metric"|"imperial"}' },
  calculator: { description: 'Evaluate an arithmetic expression exactly (+ - * / % ^, parentheses, sqrt, log, min, max, pi, e).', args: '{"expression": string, "precision"?: number}' },
  get_current_time: { description: 'Current date/time in an IANA timezone.', args: '{"timezone"?: string}' },
  read_file: { description: 'Read the text of an attached file.', args: '{"name": string}' },
};

const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;
// Custom model ids chosen from the live agentModels catalog:
// "openrouter:<upstream>" or "nvidia:<upstream>".
const CUSTOM_MODEL_RE = /^(openrouter|nvidia):([A-Za-z0-9._/@-]{2,140})$/;

// Simple per-device sliding-window rate limit: 20 chats per minute. Guest
// mode is open by design; this only stops scripted abuse from one device.
const RATE_LIMIT_PER_MIN = 20;
const rateHits = new Map<string, number[]>();
function isRateLimited(device: string): boolean {
  const now = Date.now();
  const arr = (rateHits.get(device) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= RATE_LIMIT_PER_MIN) { rateHits.set(device, arr); return true; }
  arr.push(now);
  rateHits.set(device, arr);
  // Opportunistic GC of idle entries.
  if (rateHits.size > 4096) {
    for (const [k, v] of rateHits) if (!v.length || now - v[v.length - 1] > 600_000) rateHits.delete(k);
  }
  return false;
}

// ===== tools run in the sibling `agentTools` function ========================
// Called same-origin so no user context is needed; agentTools is authless and
// stateless (it only sees the tool name, args and attachment metadata).

async function runTool(toolsUrl: string, name: string, args: Json, attachments: Attachment[]): Promise<ToolOutcome> {
  try {
    const res = await fetch(toolsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: name, args, attachments }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return { ok: false, data: null, error: `Tool service HTTP ${res.status}` };
    const out = await res.json();
    if (out && typeof out.ok === 'boolean') return out as ToolOutcome;
    return { ok: false, data: null, error: 'Tool service returned an unexpected response.' };
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : 'Tool execution failed.' };
  }
}

// ===== LLM provider layer ====================================================
class RetryableError extends Error {}

function fallbackChain(preferred: string, custom?: ModelDef | null): ModelDef[] {
  const first = MODELS.find((m) => m.id === preferred) ?? MODELS.find((m) => m.id === DEFAULT_MODEL)!;
  const rest = MODELS.filter((m) => m.id !== first.id);
  // Only attempt providers whose key is configured. A verified custom model
  // (from the live catalog) is tried first, then the curated chain backs it up.
  const chain = custom && ENDPOINTS[custom.provider].key() ? [custom, first, ...rest] : [first, ...rest];
  return chain.filter((m) => !!ENDPOINTS[m.provider].key());
}

async function callOnce(m: ModelDef, messages: ChatMsg[], maxTokens: number, stream: boolean, timeoutMs?: number): Promise<Response> {
  const key = ENDPOINTS[m.provider].key();
  if (!key) throw new RetryableError(`${m.provider} key not configured`);
  const ctl = new AbortController();
  const cap = stream ? REQUEST_TIMEOUT_STREAM_MS : (timeoutMs ?? REQUEST_TIMEOUT_MS);
  const timer = setTimeout(() => ctl.abort(), cap);
  try {
    const res = await fetch(ENDPOINTS[m.provider].url, {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(m.provider === 'openrouter' ? { 'HTTP-Referer': 'https://agent-mobile.app', 'X-Title': 'Agent Mobile' } : {}),
      },
      body: JSON.stringify({ model: m.upstream, messages, max_tokens: maxTokens, temperature: 0.3, stream }),
    });
    (res as any)._ctl = ctl;
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200);
      if (res.status === 429 || res.status >= 500 || res.status === 404 || res.status === 410 || res.status === 408) {
        throw new RetryableError(`${m.label}: HTTP ${res.status}`);
      }
      throw new Error(`${m.label}: HTTP ${res.status} ${body}`);
    }
    return res;
  } catch (e) {
    if (e instanceof RetryableError) throw e;
    if ((e as Error).name === 'AbortError') throw new RetryableError(`${m.label}: timed out`);
    if (e instanceof TypeError) throw new RetryableError(`${m.label}: network error`);
    throw e;
  } finally { clearTimeout(timer); }
}

/** Non-streaming completion with fallback. Returns content only (never reasoning). */
async function complete(preferred: string, messages: ChatMsg[], maxTokens = 2500, timeoutMs?: number, custom?: ModelDef | null): Promise<{ text: string; model: ModelDef }> {
  const chain = fallbackChain(preferred, custom);
  if (!chain.length) throw new Error('No AI provider is configured on the server.');
  const errors: string[] = [];
  // Three passes with growing backoff: free-tier 429s and momentary hangs
  // usually clear within seconds.
  for (let pass = 0; pass < 3; pass++) {
  if (pass) await new Promise((r) => setTimeout(r, PASS_DELAY_MS * (pass + 1) / 2));
  for (const m of chain) {
    try {
      const res = await callOnce(m, messages, maxTokens, false, timeoutMs);
      const data = await res.json();
      const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
      if (!text) { errors.push(`${m.label}: empty reply`); continue; }
      return { text, model: m };
    } catch (e) {
      if (e instanceof RetryableError) { errors.push(e.message); continue; }
      throw e;
    }
  }
  }
  throw new Error(`All AI providers failed (${errors.join('; ')})`);
}

/** Streaming completion with fallback. Yields content deltas as they arrive. */
async function* streamComplete(preferred: string, messages: ChatMsg[], maxTokens = 3000, custom?: ModelDef | null): AsyncGenerator<{ delta?: string; model?: ModelDef }> {
  const chain = fallbackChain(preferred, custom);
  if (!chain.length) throw new Error('No AI provider is configured on the server.');
  const errors: string[] = [];
  // Three passes; a later pass only happens if nothing was streamed yet,
  // so a retried answer can never duplicate text the user already received.
  for (let pass = 0; pass < 3; pass++) {
  if (pass) await new Promise((r) => setTimeout(r, PASS_DELAY_MS * (pass + 1) / 2));
  for (const m of chain) {
    let produced = false;
    try {
      const res = await callOnce(m, messages, maxTokens, true);
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const arm = (ms: number) => { clearTimeout(watchdog); watchdog = setTimeout(() => (res as any)._ctl?.abort(), ms); };
      const bump = () => arm(produced ? STREAM_IDLE_MS : STREAM_FIRST_MS);
      arm(STREAM_FIRST_MS);
      try {
      yield { model: m };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data:')) continue;
          bump();
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) { produced = true; yield { delta }; }
          } catch { /* ignore keep-alives / partial frames */ }
        }
      }
      } finally { clearTimeout(watchdog); }
      if (produced) return;
      errors.push(`${m.label}: empty stream`);
    } catch (e) {
      if (produced) throw e; // cannot restart mid-answer without duplicating text
      if (e instanceof RetryableError) { errors.push(e.message); continue; }
      throw e;
    }
  }
  }
  throw new Error(`All AI providers failed (${errors.join('; ')})`);
}

/** Extract the first balanced JSON object from model text (tolerates fences/prose). */
function parseAction(text: string): { action?: string; tool?: string; args?: Json; text?: string } | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

const deriveTitle = (text: string) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 48 ? `${t.slice(0, 47)}…` : t || 'New chat';
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  // Anonymous requests have no user; the service role bypasses entity access
  // rules, so every query below is scoped by the verified device id.
  const db = (base44 as any).asServiceRole ?? base44;

  const device = (req.headers.get('x-device-id') ?? '').trim();
  if (!DEVICE_RE.test(device)) return Response.json({ error: 'Missing or invalid device id.' }, { status: 400 });
  // Same-origin URL of the sibling tools function (no user context needed).
  const toolsUrl = new URL('/functions/agentTools', req.url).toString();

  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const mode: 'send' | 'regenerate' | 'edit' = ['regenerate', 'edit'].includes(body.mode) ? body.mode : 'send';
  let userText = String(body.message ?? '').trim();
  if (mode !== 'regenerate' && !userText) return Response.json({ error: '`message` is required' }, { status: 400 });
  if (userText.length > 20000) return Response.json({ error: 'Message too long' }, { status: 413 });
  if (mode !== 'send' && !body.conversationId) return Response.json({ error: '`conversationId` is required for this mode' }, { status: 400 });
  if (mode === 'edit' && !body.targetMessageId) return Response.json({ error: '`targetMessageId` is required for edit' }, { status: 400 });

  if (isRateLimited(device)) return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  const bodyModel = typeof body.model === 'string' ? body.model.trim() : '';
  let model = MODELS.some((m) => m.id === bodyModel) ? bodyModel : DEFAULT_MODEL;
  let customModel: ModelDef | null = null;
  const customMatch = CUSTOM_MODEL_RE.exec(bodyModel);
  if (customMatch) {
    const provider = customMatch[1] as Provider;
    if (ENDPOINTS[provider].key()) {
      customModel = { id: bodyModel, provider, upstream: customMatch[2], label: customMatch[2] };
      model = bodyModel;
    }
  }
  let attachments: Attachment[] = Array.isArray(body.attachments) ? body.attachments.slice(0, 10) : [];
  const systemPrompt = String(body.systemPrompt ?? '').trim() || SYSTEM_PROMPT;
  const enabledTools: string[] = (Array.isArray(body.enabledTools) ? body.enabledTools : Object.keys(TOOL_SPECS)).filter((t: string) => t in TOOL_SPECS);

  // --- Resolve conversation (device-scoped) --------------------------------
  let conversationId: string | undefined = body.conversationId;
  let title = deriveTitle(userText);
  try {
    if (conversationId) {
      const found = await db.entities.Conversation.filter({ id: conversationId }).catch(() => []);
      const convo = found?.[0];
      if (!convo || (convo.device_id ?? '') !== device) return Response.json({ error: 'Conversation not found' }, { status: 404 });
      title = convo.title;
    } else {
      const created = await db.entities.Conversation.create({ title, model, last_message_at: new Date().toISOString(), device_id: device });
      conversationId = created.id;
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  const convId = conversationId as string;

  // --- Thread surgery for regenerate / edit ---------------------------------
  let regenAttachments: Attachment[] = [];
  let editFrom = -1;
  let removeTail: (idx: number) => Promise<void> = async () => {};
  try {
    const all = (await db.entities.Message.filter({ conversation_id: convId }, 'created_date', 500)) as any[];
    removeTail = async (idx: number) => {
      for (const m of all.slice(idx)) {
        const calls = (await db.entities.ToolCall.filter({ message_id: m.id }, 'created_date', 100).catch(() => [])) as any[];
        await Promise.all(calls.map((c) => db.entities.ToolCall.delete(c.id).catch(() => {})));
        await db.entities.Message.delete(m.id).catch(() => {});
      }
    };
    if (mode === 'regenerate') {
      // Previous answers are kept: the UI shows them as switchable variants.
      let lastUser = -1;
      for (let i = all.length - 1; i >= 0; i--) if (all[i].role === 'user') { lastUser = i; break; }
      if (lastUser === -1) return Response.json({ error: 'Nothing to regenerate' }, { status: 400 });
      userText = String(all[lastUser].content ?? '');
      regenAttachments = Array.isArray(all[lastUser].attachments) ? all[lastUser].attachments : [];
    } else if (mode === 'edit') {
      const idx = all.findIndex((m) => m.id === body.targetMessageId);
      if (idx === -1 || all[idx].role !== 'user') return Response.json({ error: 'Message to edit not found' }, { status: 404 });
      editFrom = idx;
    }
  } catch (e) {
    return Response.json({ error: `Could not prepare conversation: ${(e as Error).message}` }, { status: 500 });
  }

  if (mode === 'regenerate') attachments = regenAttachments.slice(0, 10);
  if (mode !== 'regenerate') {
    const created = await db.entities.Message.create({ conversation_id: convId, role: 'user', content: userText, attachments, status: 'complete' });
    // Edit: only now that the replacement exists is it safe to drop the old turn and everything after it.
    if (editFrom >= 0) { await removeTail(editFrom); void created; }
  }
  const assistant = await db.entities.Message.create({ conversation_id: convId, role: 'assistant', content: '', model: customModel ? customModel.upstream.split('/').slice(-1)[0].slice(0, 40) : model, status: 'streaming' });

  const rawHistory = ((await db.entities.Message.filter({ conversation_id: convId }, 'created_date', HISTORY_LIMIT)) as any[])
    .filter((m) => m.id !== assistant.id && (m.role === 'user' || (m.role === 'assistant' && m.content)));
  // Variants of earlier turns collapse to the newest answer; variants of the
  // turn being regenerated are dropped so the model does not echo itself.
  const history: any[] = [];
  for (let i = 0; i < rawHistory.length; i++) {
    const m = rawHistory[i];
    if (m.role === 'assistant') {
      const next = rawHistory[i + 1];
      if (next && next.role === 'assistant') continue;      // keep only the last of a run
      if (i === rawHistory.length - 1) continue;             // trailing run = the turn being (re)answered
    }
    history.push(m);
  }
  const attachNote = attachments.length ? `\n\n[Attached files: ${attachments.map((a) => `${a.name} (${a.mime})`).join(', ')}]` : '';
  const chatHistory: ChatMsg[] = history.map((m, i) => ({
    role: m.role as 'user' | 'assistant',
    content: i === history.length - 1 && m.role === 'user' ? m.content + attachNote : m.content,
  }));

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Json) => { try { controller.enqueue(enc.encode(JSON.stringify(event) + '\n')); } catch { /* client went away */ } };
      let finalText = '';
      try {
        send({ type: 'conversation', conversationId: convId, title });
        send({ type: 'message_start', messageId: assistant.id });

        const scratch: string[] = [];
        // Same tool + same args twice means the model is looping; stop calling tools.
        const called: string[] = [];

        // Phase 1: tool loop (decide whether a tool is needed).
        if (enabledTools.length) {
          const toolList = enabledTools.map((t) => `- ${t}: ${TOOL_SPECS[t].description} args: ${TOOL_SPECS[t].args}`).join('\n');
          for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
            const instruction = `${systemPrompt}

You can call ONE tool per step. Available tools:
${toolList}

Decide the next step. Respond with ONLY a JSON object, no prose, no code fences:
- To call a tool: {"action":"tool","tool":"<name>","args":{...}}
- If no tool is needed (or you have enough information): {"action":"final"}
Only call a tool when it clearly helps (current facts, exact math, weather, time, attached files).` +
              (scratch.length ? `\n\nTool results so far:\n${scratch.join('\n')}` : '');
            const { text } = await complete(model, [{ role: 'system', content: instruction }, ...chatHistory], 1200, TOOL_TIMEOUT_MS, customModel);
            const act = parseAction(text);
            if (act?.action === 'tool' && act.tool && enabledTools.includes(act.tool)) {
              const signature = `${act.tool}:${JSON.stringify(act.args ?? {})}`;
              if (called.includes(signature)) break; // duplicate call -> answer with what we have
              called.push(signature);
              const callId = `call_${crypto.randomUUID()}`;
              const args = (act.args && typeof act.args === 'object' ? act.args : {}) as Json;
              send({ type: 'tool_call', id: callId, name: act.tool, arguments: args });
              const started = Date.now();
              const outcome = await runTool(toolsUrl, act.tool, args, attachments);
              const durationMs = Date.now() - started;
              const status = outcome.ok ? 'success' : 'error';
              send({ type: 'tool_result', id: callId, name: act.tool, result: outcome.data, status, error: outcome.error, durationMs });
              await db.entities.ToolCall.create({
                message_id: assistant.id, conversation_id: convId, name: act.tool, arguments: args,
                result: (outcome.data ?? {}) as Json, status, error: outcome.error ?? '', duration_ms: durationMs,
              }).catch(() => {});
              scratch.push(`[${act.tool}] ${JSON.stringify(outcome.ok ? outcome.data : { error: outcome.error }).slice(0, 8000)}`);
              continue;
            }
            break; // "final", unparsable, or disabled tool -> go answer
          }
        }

        // Phase 2: stream the final answer token-by-token.
        const answerSystem = systemPrompt + (scratch.length
          ? `\n\nUse these tool results to write the final answer. Reply as normal conversational Markdown for the user: state the result and briefly explain it. Never output XML, tool-call markup, or raw JSON - you are NOT calling a tool in this step.\n${scratch.join('\n')}` : '');
        for await (const part of streamComplete(model, [{ role: 'system', content: answerSystem }, ...chatHistory], 3000, customModel)) {
          if (part.delta) { finalText += part.delta; send({ type: 'delta', text: part.delta }); }
        }
        finalText = finalText.trim();
        if (!finalText) throw new Error('The model returned an empty answer. Please try again.');

        await db.entities.Message.update(assistant.id, { content: finalText, status: 'complete' });
        await db.entities.Conversation.update(convId, { last_message_at: new Date().toISOString(), model });
        send({ type: 'message_end', messageId: assistant.id, content: finalText });
        send({ type: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        // A failed turn that produced nothing must not leave an empty answer behind
        // (it would show up as a blank variant). Keep partial text, drop empty rows.
        if (finalText.trim()) await db.entities.Message.update(assistant.id, { content: finalText, status: 'error' }).catch(() => {});
        else {
          const calls = (await db.entities.ToolCall.filter({ message_id: assistant.id }, 'created_date', 50).catch(() => [])) as any[];
          await Promise.all(calls.map((c) => db.entities.ToolCall.delete(c.id).catch(() => {})));
          await db.entities.Message.delete(assistant.id).catch(() => {});
        }
        send({ type: 'error', message });
        send({ type: 'done' });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' },
  });
});

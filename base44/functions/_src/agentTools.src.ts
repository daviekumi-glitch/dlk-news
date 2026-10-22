import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ---------------------------------------------------------------------------
// agentTools: executes one assistant tool call for the signed-in user.
//
// POST { tool, args, attachments } -> { ok, data, error? }
// Called by `agentChat` (and usable directly). Requires authentication, never
// throws to the caller, and uses only keyless public APIs, so no secrets are
// involved and nothing here consumes Base44 integration credits.
// ---------------------------------------------------------------------------

const MAX_RESULT_CHARS = 12000;
type Json = Record<string, unknown>;
interface Attachment { id: string; name: string; mime: string; size: number; url?: string; text?: string }
interface ToolOutcome { ok: boolean; data: unknown; error?: string }

// ===== calculator (embedded from src/lib/tools/calculator.ts) =====
// ---------------------------------------------------------------------------
// Deterministic arithmetic evaluator for the `calculator` tool.
//
// Implemented as a hand-written recursive-descent parser rather than `eval` or
// `new Function`, so the tool is safe to expose to the model without widening
// the code-execution surface. Supports + - * / % ^, parentheses, unary minus
// and a small set of math functions/constants.
// ---------------------------------------------------------------------------

interface CalculatorResult {
  value: number;
  formatted: string;
  expression: string;
}

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

type Token =
  | { kind: "num"; value: number }
  | { kind: "ident"; value: string }
  | { kind: "op"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Numbers, including 1.5 and .5 and 1e-3.
    if (/[0-9.]/.test(ch)) {
      let raw = "";
      while (i < input.length && /[0-9.]/.test(input[i])) raw += input[i++];
      if (input[i] === "e" || input[i] === "E") {
        let exp = input[i++];
        if (input[i] === "+" || input[i] === "-") exp += input[i++];
        while (i < input.length && /[0-9]/.test(input[i])) exp += input[i++];
        raw += exp;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number "${raw}"`);
      tokens.push({ kind: "num", value });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let name = "";
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) name += input[i++];
      tokens.push({ kind: "ident", value: name.toLowerCase() });
      continue;
    }

    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma" });
      i++;
      continue;
    }
    if ("+-*/%^".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "×") {
      tokens.push({ kind: "op", value: "*" });
      i++;
      continue;
    }
    if (ch === "÷") {
      tokens.push({ kind: "op", value: "/" });
      i++;
      continue;
    }

    throw new Error(`Unexpected character "${ch}" in expression`);
  }

  return tokens;
}

/** Recursive-descent parser over the token list. */
function parse(tokens: Token[]): number {
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function parseExpression(): number {
    let left = parseTerm();
    // Addition / subtraction (left-associative).
    while (peek()?.kind === "op" && ["+", "-"].includes((peek() as { value: string }).value)) {
      const op = (eat() as { value: string }).value;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseUnary();
    while (
      peek()?.kind === "op" &&
      ["*", "/", "%"].includes((peek() as { value: string }).value)
    ) {
      const op = (eat() as { value: string }).value;
      const right = parseUnary();
      if (op === "*") left = left * right;
      else if (op === "/") {
        if (right === 0) throw new Error("Division by zero");
        left = left / right;
      } else {
        if (right === 0) throw new Error("Modulo by zero");
        left = left % right;
      }
    }
    return left;
  }

  function parseUnary(): number {
    const token = peek();
    if (token?.kind === "op" && (token.value === "-" || token.value === "+")) {
      eat();
      const value = parseUnary();
      return token.value === "-" ? -value : value;
    }
    return parsePower();
  }

  function parsePower(): number {
    const base = parsePrimary();
    const token = peek();
    if (token?.kind === "op" && token.value === "^") {
      eat();
      // Right-associative: 2^3^2 === 2^(3^2).
      const exponent = parseUnary();
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parsePrimary(): number {
    const token = eat();
    if (!token) throw new Error("Unexpected end of expression");

    if (token.kind === "num") return token.value;

    if (token.kind === "lparen") {
      const value = parseExpression();
      const closing = eat();
      if (closing?.kind !== "rparen") throw new Error("Missing closing parenthesis");
      return value;
    }

    if (token.kind === "ident") {
      const name = token.value;

      if (name in CONSTANTS) return CONSTANTS[name];

      const fn = FUNCTIONS[name];
      if (!fn) throw new Error(`Unknown name "${name}"`);

      const opening = eat();
      if (opening?.kind !== "lparen") {
        throw new Error(`Expected "(" after ${name}`);
      }
      const args: number[] = [parseExpression()];
      while (peek()?.kind === "comma") {
        eat();
        args.push(parseExpression());
      }
      const closing = eat();
      if (closing?.kind !== "rparen") throw new Error(`Missing ")" after ${name}(`);
      return fn(...args);
    }

    throw new Error("Unexpected token in expression");
  }

  const result = parseExpression();
  if (pos < tokens.length) throw new Error("Unexpected trailing input");
  return result;
}

/**
 * Evaluate an arithmetic expression. Throws on malformed input — callers in the
 * tool layer turn that into a structured error outcome.
 */
function evaluate(expression: string, precision = 6): CalculatorResult {
  const source = expression.trim();
  if (!source) throw new Error("`expression` must not be empty");
  if (source.length > 500) throw new Error("Expression is too long (max 500 characters)");

  const tokens = tokenize(source);
  if (tokens.length === 0) throw new Error("`expression` must not be empty");

  const value = parse(tokens);
  if (!Number.isFinite(value)) throw new Error("Expression did not evaluate to a finite number");

  const digits = Math.min(Math.max(Math.trunc(precision), 0), 12);
  const rounded = Number.parseFloat(value.toFixed(digits));

  return {
    value: rounded,
    formatted: rounded.toLocaleString("en-US", { maximumFractionDigits: digits }),
    expression: source,
  };
}

function truncate(value: unknown): unknown {
  const json = JSON.stringify(value) ?? 'null';
  if (json.length <= MAX_RESULT_CHARS) return value;
  return { truncated: true, preview: json.slice(0, MAX_RESULT_CHARS) };
}

const WMO: Record<number, string> = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'rime fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'rain showers', 81: 'rain showers', 82: 'violent rain showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with heavy hail',
};

// Wikipedia and several public APIs reject requests without a descriptive User-Agent.
const UA = 'AgentMobile/1.0 (https://github.com/daviekumi-glitch/agent-mobile)';

async function fetchJson(url: string, ms = 12000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

async function webSearch(query: string): Promise<ToolOutcome> {
  // DuckDuckGo instant answers + Wikipedia search: keyless and reliable enough to ground answers.
  const [ddg, wiki] = await Promise.allSettled([
    fetchJson(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`),
    fetchJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`),
  ]);
  const results: { title: string; snippet: string; url: string }[] = [];
  if (ddg.status === 'fulfilled') {
    const d = ddg.value;
    if (d.AbstractText) results.push({ title: d.Heading || query, snippet: d.AbstractText, url: d.AbstractURL || '' });
    for (const r of (d.RelatedTopics || []).slice(0, 4)) if (r.Text) results.push({ title: r.Text.slice(0, 60), snippet: r.Text, url: r.FirstURL || '' });
  }
  if (wiki.status === 'fulfilled') {
    for (const r of wiki.value?.query?.search || []) {
      results.push({ title: r.title, snippet: String(r.snippet).replace(/<[^>]+>/g, ''), url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(r.title).replace(/ /g, '_'))}` });
    }
  }
  const top = results.find((r) => r.url.startsWith('https://en.wikipedia.org/wiki/'));
  if (top) {
    try {
      const sum = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${top.url.split('/wiki/')[1]}`);
      if (sum?.extract) results.unshift({ title: sum.title || top.title, snippet: String(sum.extract).slice(0, 700), url: sum.content_urls?.desktop?.page || top.url });
    } catch { /* optional enrichment */ }
  }
  if (!results.length) return { ok: false, data: null, error: 'No search results found. Answer from your own knowledge and say the search found nothing.' };
  return { ok: true, data: truncate({ query, results: results.slice(0, 8) }) };
}

async function weatherOpenMeteo(location: string, imperial: boolean): Promise<ToolOutcome> {
  const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location.split(',')[0].trim())}&count=1&language=en&format=json`);
  const place = geo?.results?.[0];
  if (!place) return { ok: false, data: null, error: `Could not find a place called "${location}".` };
  const w = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,pressure_msl,wind_speed_10m,weather_code${imperial ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : ''}`);
  const c = w?.current;
  if (!c) throw new Error('no data');
  return { ok: true, data: {
    location: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
    temperature: c.temperature_2m, feels_like: c.apparent_temperature, humidity: c.relative_humidity_2m,
    pressure: c.pressure_msl, wind_speed: c.wind_speed_10m, conditions: WMO[c.weather_code] ?? 'unknown',
    units: imperial ? 'imperial' : 'metric', observed_at: c.time, source: 'open-meteo',
  } };
}

async function weatherWttr(location: string, imperial: boolean): Promise<ToolOutcome> {
  const d = await fetchJson(`https://wttr.in/${encodeURIComponent(location)}?format=j1`, 15000);
  const c = d?.current_condition?.[0];
  const area = d?.nearest_area?.[0];
  if (!c) throw new Error('no data');
  const v = (x: any) => (Array.isArray(x) ? x[0]?.value : x);
  return { ok: true, data: {
    location: [v(area?.areaName), v(area?.region), v(area?.country)].filter((x, i, a) => x && a.indexOf(x) === i).join(', ') || location,
    temperature: Number(imperial ? c.temp_F : c.temp_C), feels_like: Number(imperial ? c.FeelsLikeF : c.FeelsLikeC),
    humidity: Number(c.humidity), pressure: Number(c.pressure), wind_speed: Number(imperial ? c.windspeedMiles : c.windspeedKmph),
    conditions: String(v(c.weatherDesc) ?? 'unknown').trim().toLowerCase(),
    units: imperial ? 'imperial' : 'metric', observed_at: c.observation_time, source: 'wttr.in',
  } };
}

async function getWeather(location: string, units: string): Promise<ToolOutcome> {
  const imperial = units === 'imperial';
  let notFound: ToolOutcome | null = null;
  for (const source of [weatherOpenMeteo, weatherWttr]) {
    try {
      const r = await source(location, imperial);
      if (r.ok) return r;
      notFound = r;               // a definitive "no such place" from the geocoder
      if (source === weatherOpenMeteo) continue; // let the second source confirm
    } catch { /* quota, network or empty data: try the next source */ }
  }
  return notFound ?? { ok: false, data: null, error: 'Weather services are temporarily unavailable. Please try again shortly.' };
}

async function runTool(name: string, args: Json, attachments: Attachment[]): Promise<ToolOutcome> {
  try {
    switch (name) {
      case 'web_search': {
        const query = String(args.query ?? '').trim();
        if (!query) return { ok: false, data: null, error: 'A non-empty `query` is required.' };
        return await webSearch(query);
      }
      case 'get_weather': {
        const location = String(args.location ?? '').trim();
        if (!location) return { ok: false, data: null, error: 'A non-empty `location` is required.' };
        return await getWeather(location, String(args.units ?? 'metric'));
      }
      case 'calculator': {
        const r = evaluate(String(args.expression ?? ''), Number(args.precision ?? 6));
        return { ok: true, data: r };
      }
      case 'get_current_time': {
        const tz = String(args.timezone || 'UTC');
        const now = new Date();
        const local = new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }).format(now);
        return { ok: true, data: { timezone: tz, iso: now.toISOString(), local } };
      }
      case 'read_file': {
        const wanted = String(args.name ?? '').trim().toLowerCase();
        const match = attachments.find((a) => a.name.toLowerCase() === wanted);
        if (!match) return { ok: false, data: null, error: `No attachment named "${args.name}". Available: ${attachments.map((a) => a.name).join(', ') || '(none)'}` };
        if (match.text) return { ok: true, data: truncate({ name: match.name, content: match.text }) };
        if (match.url) {
          const res = await fetch(match.url);
          if (!res.ok) return { ok: false, data: null, error: `Could not fetch attachment (HTTP ${res.status}).` };
          return { ok: true, data: truncate({ name: match.name, content: await res.text() }) };
        }
        return { ok: false, data: null, error: `"${match.name}" has no readable text.` };
      }
      default:
        return { ok: false, data: null, error: `Unknown tool "${name}".` };
    }
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : 'Tool execution failed.' };
  }
}


const TOOLS = ['web_search', 'get_weather', 'calculator', 'get_current_time', 'read_file'];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ ok: false, data: null, error: 'Not authenticated' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return Response.json({ ok: false, data: null, error: 'Invalid JSON body' }, { status: 400 }); }
  const tool = String(body?.tool ?? '');
  if (!TOOLS.includes(tool)) return Response.json({ ok: false, data: null, error: `Unknown tool "${tool}".` }, { status: 400 });

  const args = (body.args && typeof body.args === 'object' ? body.args : {}) as Json;
  const attachments: Attachment[] = Array.isArray(body.attachments) ? body.attachments.slice(0, 10) : [];
  return Response.json(await runTool(tool, args, attachments));
});

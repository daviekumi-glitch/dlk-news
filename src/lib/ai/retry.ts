// ---------------------------------------------------------------------------
// Retry with exponential backoff for upstream model calls.
//
// The chat route talks to an LLM provider over the network, so a turn can fail
// for reasons that have nothing to do with the request: a 429 while a rate
// limit resets, a 502/503 from a load balancer, or a dropped connection. Those
// are worth one or two more attempts. A 400/401/403/404 is not - retrying a
// malformed request or a bad key just burns time and quota.
//
// The delay maths is pure and unit-tested; the wrapper is deliberately small so
// the streaming loop stays readable.
// ---------------------------------------------------------------------------

/** Statuses that indicate a transient condition rather than a bad request. */
const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/**
 * Delay before attempt `attempt` (1-based), in milliseconds.
 *
 * Exponential with full jitter: the base doubles per attempt and is capped, then
 * a random fraction of it is used. Jitter matters when several turns fail at
 * once - without it they would all retry in lockstep and re-trigger the same
 * rate limit.
 */
export function backoffDelay(
  attempt: number,
  baseMs = 500,
  maxMs = 8_000,
  random: () => number = Math.random,
): number {
  const safeAttempt = Math.max(1, Math.trunc(attempt));
  const ceiling = Math.min(baseMs * 2 ** (safeAttempt - 1), maxMs);
  // Full jitter: anywhere in [ceiling/2, ceiling].
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/** Pull an HTTP status off an error thrown by the OpenAI SDK, if present. */
export function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = (error as { status?: unknown }).status;
  return typeof candidate === "number" ? candidate : null;
}

/**
 * True when a failed attempt is worth repeating.
 *
 * `producedOutput` is the important guard: once any text has been streamed to
 * the client, retrying would replay the beginning of the answer and duplicate
 * it in the thread. In that case the error is surfaced instead.
 */
export function shouldRetry(error: unknown, attempt: number, maxAttempts: number, producedOutput: boolean): boolean {
  if (producedOutput) return false;
  if (attempt >= maxAttempts) return false;

  const status = statusOf(error);
  if (status !== null) return isRetryableStatus(status);

  // No status at all means a transport-level failure (DNS, reset, timeout),
  // which is exactly the case a retry is for.
  const name = (error as { name?: unknown })?.name;
  if (name === "AbortError") return false;
  return true;
}

export interface RetryOptions {
  maxAttempts?: number;
  baseMs?: number;
  maxMs?: number;
  /** Called before each wait, for logging. */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  /** Consulted before every retry; return true once output has been emitted. */
  hasProducedOutput?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying transient failures with exponential backoff.
 *
 * The final error is rethrown unchanged so the caller's existing error handling
 * (and the user-facing message) is unaffected.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 3,
    baseMs = 500,
    maxMs = 8_000,
    onRetry,
    hasProducedOutput,
    sleep = defaultSleep,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const produced = hasProducedOutput?.() ?? false;
      if (!shouldRetry(error, attempt, maxAttempts, produced)) throw error;

      const delayMs = backoffDelay(attempt, baseMs, maxMs);
      onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }

  throw lastError;
}

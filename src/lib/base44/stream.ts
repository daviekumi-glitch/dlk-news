import { FUNCTIONS_ORIGIN } from "./client";
import { getDeviceId } from "./device";
import type { ChatRequestBody, ChatStreamEvent } from "@/lib/types";

/**
 * Calls the `agentChat` Base44 backend function and yields its NDJSON events.
 * Guest mode: the request is scoped by the device id header, not an account.
 */
export async function* streamChat(
  body: ChatRequestBody,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  if (!FUNCTIONS_ORIGIN) {
    throw new Error("NEXT_PUBLIC_BASE44_APP_URL is not configured.");
  }

  const res = await fetch(`${FUNCTIONS_ORIGIN}/functions/agentChat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": getDeviceId() },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `Request failed (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as ChatStreamEvent;
      } catch {
        /* ignore malformed line */
      }
    }
  }
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer) as ChatStreamEvent;
    } catch {
      /* ignore */
    }
  }
}

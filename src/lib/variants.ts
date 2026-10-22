import type { Message } from "@/lib/types";

// ---------------------------------------------------------------------------
// Assistant variant groups.
//
// Regenerating a response does not overwrite the previous answer — it appends a
// second assistant message after the same user turn. A *variant group* is that
// run of consecutive assistant messages, identified by the user message it
// answers. This module is pure so the grouping rules are unit-testable without
// mounting anything.
// ---------------------------------------------------------------------------

/** Group id used when assistant messages appear before any user message. */
export const HEAD_GROUP = "__head__";

/** Map of group id -> the assistant messages answering that turn, in order. */
export type VariantGroups = Map<string, Message[]>;

/**
 * Walk the thread and collect runs of assistant messages, keyed by the id of
 * the user message that precedes each run.
 *
 * `system` and `tool` messages are ignored for grouping purposes but do not
 * break a run — a turn that used tools is still one variant.
 */
export function groupAssistantVariants(messages: Message[]): VariantGroups {
  const groups: VariantGroups = new Map();
  let currentGroup = HEAD_GROUP;

  for (const message of messages) {
    if (message.role === "user") {
      currentGroup = message.id;
      continue;
    }
    if (message.role !== "assistant") continue;

    const existing = groups.get(currentGroup);
    if (existing) existing.push(message);
    else groups.set(currentGroup, [message]);
  }

  return groups;
}

/** True when a turn has more than one answer to switch between. */
export function hasVariants(groups: VariantGroups, groupId: string): boolean {
  return (groups.get(groupId)?.length ?? 0) > 1;
}

/**
 * Which assistant message of a group should actually be rendered.
 *
 * `selected` is clamped rather than trusted: the index is persisted per
 * conversation and could be stale after messages are deleted, in which case
 * falling back to the last (newest) variant is the sensible answer.
 */
export function pickVariant(
  groups: VariantGroups,
  groupId: string,
  selected: number | undefined,
): Message | null {
  const variants = groups.get(groupId);
  if (!variants || variants.length === 0) return null;
  if (selected === undefined) return variants[variants.length - 1];
  const index = Math.min(Math.max(Math.trunc(selected), 0), variants.length - 1);
  return variants[index];
}

/**
 * The subset of a thread that should be rendered, with variant groups
 * collapsed to the selected answer.
 */
export function visibleMessages(
  messages: Message[],
  selected: Record<string, number>,
): Message[] {
  const groups = groupAssistantVariants(messages);
  const emitted = new Set<string>();

  return messages.filter((message) => {
    if (message.role !== "assistant") return true;

    // Find the group this message belongs to and only keep the chosen member.
    for (const [groupId, variants] of groups) {
      if (!variants.some((v) => v.id === message.id)) continue;
      if (emitted.has(groupId)) return false;
      const chosen = pickVariant(groups, groupId, selected[groupId]);
      if (chosen?.id !== message.id) return false;
      emitted.add(groupId);
      return true;
    }

    return true;
  });
}

/**
 * Index of the newest assistant message in an already-collapsed thread.
 *
 * This must be computed against the *rendered* list, never the raw one:
 * collapsing a variant group removes rows, so an index taken from the full
 * array points at the wrong bubble and would attach "regenerate" to an older
 * answer. Returns -1 when the thread has no assistant message yet.
 */
export function lastAssistantIndex(rendered: Message[]): number {
  for (let i = rendered.length - 1; i >= 0; i--) {
    if (rendered[i].role === "assistant") return i;
  }
  return -1;
}

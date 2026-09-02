import type { AgentActivityKind } from "./tool-activity-presentation";

const DEFAULT_VISIBLE_ACTIVITY_LIMIT = 8;
const DEFAULT_DEDUPLICATION_WINDOW_MS = 30_000;

export type AgentActivitySource = "agent" | "learner" | "system";

export type AgentActivityTimelineEntry = Readonly<{
  id: string;
  kind: AgentActivityKind;
  source: AgentActivitySource;
  summary: string;
  occurredAt: string;
  dedupeKey: string;
  status?: "cancelled" | "completed" | "failed" | "started" | "succeeded";
}>;

export function buildAgentActivityTimeline(
  entries: readonly AgentActivityTimelineEntry[],
  options: Readonly<{
    maxEntries?: number;
    deduplicationWindowMs?: number;
  }> = {},
): AgentActivityTimelineEntry[] {
  const maxEntries = options.maxEntries ?? DEFAULT_VISIBLE_ACTIVITY_LIMIT;
  const deduplicationWindowMs =
    options.deduplicationWindowMs ?? DEFAULT_DEDUPLICATION_WINDOW_MS;
  const timeline: AgentActivityTimelineEntry[] = [];

  [...entries]
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .forEach((entry) => {
      const duplicateIndex = findRecentDuplicate(
        timeline,
        entry,
        deduplicationWindowMs,
      );
      if (duplicateIndex >= 0) timeline.splice(duplicateIndex, 1);
      timeline.push({ ...entry });
    });

  return timeline.slice(-Math.max(1, maxEntries));
}

function findRecentDuplicate(
  timeline: readonly AgentActivityTimelineEntry[],
  entry: AgentActivityTimelineEntry,
  windowMs: number,
): number {
  const occurredAt = Date.parse(entry.occurredAt);
  if (!Number.isFinite(occurredAt)) return -1;
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const previous = timeline[index];
    if (!previous) continue;
    const elapsed = occurredAt - Date.parse(previous.occurredAt);
    if (elapsed > windowMs) return -1;
    if (
      elapsed >= 0 &&
      previous.source === entry.source &&
      previous.dedupeKey === entry.dedupeKey
    ) {
      return index;
    }
  }
  return -1;
}

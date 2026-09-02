import { describe, expect, it } from "vitest";

import {
  buildAgentActivityTimeline,
  type AgentActivityTimelineEntry,
} from "./agent-activity-timeline";

describe("buildAgentActivityTimeline", () => {
  it("sorts entries and replaces equivalent actions despite normal tool latency", () => {
    const timeline = buildAgentActivityTimeline([
      activity("third", "2026-09-01T17:02:12.000Z", "file:variables.js", "completed"),
      activity("first", "2026-09-01T17:02:01.000Z", "guide:start", "started"),
      activity("second", "2026-09-01T17:02:05.000Z", "file:variables.js", "started"),
    ]);

    expect(timeline.map(({ id }) => id)).toEqual(["first", "third"]);
    expect(timeline[1]?.status).toBe("completed");
  });

  it("keeps equivalent actions outside the window and bounds recent entries", () => {
    const timeline = buildAgentActivityTimeline(
      [
        activity("one", "2026-09-01T17:02:01.000Z", "file:variables.js"),
        activity("two", "2026-09-01T17:02:40.000Z", "file:variables.js"),
        activity("three", "2026-09-01T17:02:41.000Z", "guide:start"),
      ],
      { maxEntries: 2 },
    );

    expect(timeline.map(({ id }) => id)).toEqual(["two", "three"]);
  });
});

function activity(
  id: string,
  occurredAt: string,
  dedupeKey: string,
  status: AgentActivityTimelineEntry["status"] = "completed",
): AgentActivityTimelineEntry {
  return {
    id,
    kind: "file",
    source: "agent",
    summary: id,
    occurredAt,
    dedupeKey,
    status,
  };
}

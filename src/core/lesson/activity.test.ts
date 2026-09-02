import { describe, expect, it } from "vitest";

import type { InteractionEvent } from "@/core/platform/contracts";

import { LessonActivityService } from "./activity";
import { createActiveLessonState } from "./state";
import { LessonStore } from "./store";

describe("LessonActivityService", () => {
  it("retains a bounded real activity feed and replaces repeated event IDs", () => {
    const service = createService();
    Array.from({ length: 101 }, (_, index) => index + 1).forEach((number) => {
      service.recordActivity({
        id: `activity.${number}`,
        typeId: "lesson.progressed",
        source: "system",
        occurredAt: "2026-08-30T00:00:00.000Z",
        summary: `Activity ${number}`,
      });
    });
    service.recordActivity({
      id: "activity.101",
      typeId: "lesson.progressed",
      source: "agent",
      occurredAt: "2026-08-30T00:00:01.000Z",
      summary: "Updated activity",
    });

    const activity = service.recordActivity({
      id: "activity.102",
      typeId: "lesson.progressed",
      source: "system",
      occurredAt: "2026-08-30T00:00:02.000Z",
    }).activity;

    expect(activity).toHaveLength(100);
    expect(activity[0]?.id).toBe("activity.3");
    expect(activity.at(-2)).toEqual(
      expect.objectContaining({
        id: "activity.101",
        source: "agent",
        summary: "Updated activity",
      }),
    );
  });

  it("stores only the normalized interaction contract and drops raw payload fields", () => {
    const service = createService();
    const unsafeEvent = {
      id: "interaction.1",
      typeId: "interaction.fake-activate",
      targetRef: {
        resolverId: "target.fake",
        input: { anchorId: "anchor.fake" },
      },
      surfaceId: "surface.fake",
      lessonStepId: "step.1",
      environmentRevision: 3,
      occurredAt: "2026-08-30T00:00:00.000Z",
      summary: `  Activated   target ${"x".repeat(400)}  `,
      outcome: "success",
      rawEvent: { type: "click" },
      keystrokes: "private learner input",
      payload: { arbitrary: true },
    } as InteractionEvent;

    const interaction = service.recordInteraction(unsafeEvent).interactions[0];

    expect(interaction).toEqual({
      id: "interaction.1",
      typeId: "interaction.fake-activate",
      targetRef: {
        resolverId: "target.fake",
        input: { anchorId: "anchor.fake" },
      },
      surfaceId: "surface.fake",
      lessonStepId: "step.1",
      environmentRevision: 3,
      occurredAt: "2026-08-30T00:00:00.000Z",
      summary: expect.any(String),
      outcome: "success",
    });
    expect(interaction?.summary).toHaveLength(300);
    expect(JSON.stringify(interaction)).not.toContain("private learner input");
    expect(JSON.stringify(interaction)).not.toContain("arbitrary");
  });

  it("updates agent status and carries capability-declared assistant intent only", () => {
    const service = createService();
    const state = service.setAgentState({
      status: "waiting",
      message: `  Waiting   locally ${"x".repeat(600)}  `,
      assistantIntent: {
        stateId: "assistant.fake-thinking",
        occurredAt: "2026-08-30T00:00:00.000Z",
        lessonStepId: "step.1",
        reasonEventId: "interaction.1",
      },
    });

    expect(state.agent.status).toBe("waiting");
    expect(state.agent.message).toHaveLength(500);
    expect(state.agent.assistantIntent?.stateId).toBe("assistant.fake-thinking");
  });
});

function createService(): LessonActivityService {
  const store = new LessonStore(
    createActiveLessonState(
      {
        id: "lesson.fake",
        title: "Fake lesson",
        objective: "Exercise the activity service.",
      },
      [
        {
          id: "step.1",
          title: "Step 1",
          objective: "Complete the step.",
          criteria: [],
          hints: [],
        },
      ],
    ),
  );
  return new LessonActivityService(store);
}

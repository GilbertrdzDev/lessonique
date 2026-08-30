import { describe, expect, expectTypeOf, it } from "vitest";

import type { LessonState, LessonStoreAdapter } from "./contracts";

describe("lesson contracts", () => {
  it("accepts provider-neutral lesson, validation, target, and assistant IDs", () => {
    const state = {
      status: "active",
      lesson: {
        id: "lesson.fake",
        title: "Provider-neutral lesson",
        objective: "Exercise a fake provider without changing the orchestrator.",
        locale: "en",
      },
      plan: {
        activeStepId: "step.fake",
        revision: 1,
        steps: [
          {
            id: "step.fake",
            title: "Use the fake provider",
            objective: "Prove that IDs stay extensible.",
            criteria: [
              {
                id: "criterion.fake",
                validatorId: "validator.fake",
                input: { expected: true },
              },
            ],
            hints: ["Inspect the declared capability."],
            status: "active",
            attempts: [],
            revealedHintCount: 0,
          },
        ],
      },
      progress: {
        totalSteps: 1,
        completedSteps: 0,
        failedSteps: 0,
        percentage: 0,
      },
      agent: {
        status: "waiting",
        assistantIntent: {
          stateId: "assistant.fake-thinking",
          occurredAt: "2026-08-30T00:00:00.000Z",
          lessonStepId: "step.fake",
        },
      },
      activity: [],
      interactions: [
        {
          id: "interaction.fake",
          typeId: "interaction.fake-activate",
          targetRef: {
            resolverId: "target.fake",
            input: { anchorId: "anchor.fake" },
          },
          lessonStepId: "step.fake",
          environmentRevision: 1,
          occurredAt: "2026-08-30T00:00:00.000Z",
          outcome: "success",
        },
      ],
      waits: [
        {
          id: "wait.fake",
          condition: {
            kind: "interaction",
            eventTypeId: "interaction.fake-activate",
            target: {
              resolverId: "target.fake",
              input: { anchorId: "anchor.fake" },
            },
          },
          status: "pending",
          startedAt: "2026-08-30T00:00:00.000Z",
        },
      ],
      revision: 1,
    } satisfies LessonState;

    expect(state.lesson.id).toBe("lesson.fake");
    expect(state.interactions[0]?.targetRef?.resolverId).toBe("target.fake");
    expect(state.agent.assistantIntent?.stateId).toBe("assistant.fake-thinking");
  });

  it("defines the observable store adapter boundary", () => {
    expectTypeOf<LessonStoreAdapter>().toMatchObjectType<{
      getSnapshot(): LessonState;
      subscribe(listener: () => void): () => void;
      commit(nextState: LessonState): void;
    }>();
  });
});

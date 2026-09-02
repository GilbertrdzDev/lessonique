import { describe, expect, it } from "vitest";

import { WorkspaceStore } from "@/core/workspace/store";

import type { LessonStepDefinition } from "./contracts";
import { createActiveLessonState } from "./state";
import { LessonStore } from "./store";
import {
  CompleteStepUseCase,
  RecordAttemptUseCase,
  RevealHintUseCase,
  SetActiveStepUseCase,
  UpdateLessonPlanUseCase,
} from "./use-cases";

describe("lesson plan use cases", () => {
  it("patches a plan transactionally without modifying workspace files", () => {
    const store = createStore();
    const workspace = new WorkspaceStore();
    workspace.commit({
      ...workspace.getSnapshot(),
      files: [
        {
          path: "lesson.fake",
          languageId: "language.fake",
          content: "unchanged",
          visible: true,
        },
      ],
    });
    const workspaceFiles = workspace.getSnapshot().files;
    const update = new UpdateLessonPlanUseCase(store);

    const state = update.execute([
      {
        type: "insert_step",
        afterStepId: "step.1",
        step: createStep("step.inserted", "criterion.inserted"),
      },
      {
        type: "update_step",
        stepId: "step.inserted",
        patch: { title: "Updated inserted step" },
      },
      { type: "set_agent_message", message: "Plan adapted locally." },
    ]);

    expect(state.plan.steps.map((step) => step.id)).toEqual([
      "step.1",
      "step.inserted",
      "step.2",
      "step.3",
    ]);
    expect(state.plan.steps[1]?.title).toBe("Updated inserted step");
    expect(state.agent.message).toBe("Plan adapted locally.");
    expect(workspace.getSnapshot().files).toBe(workspaceFiles);
  });

  it("leaves state unchanged when any operation in a batch is invalid", () => {
    const store = createStore();
    const before = store.getSnapshot();
    const update = new UpdateLessonPlanUseCase(store);

    expect(() =>
      update.execute([
        {
          type: "insert_step",
          step: createStep("step.inserted", "criterion.inserted"),
        },
        { type: "remove_step", stepId: "step.missing" },
      ]),
    ).toThrow('Lesson step "step.missing" is not registered in the plan.');
    expect(store.getSnapshot()).toBe(before);
  });

  it("sets one active step, advances on completion, and completes the lesson", () => {
    const store = createStore();
    const setActive = new SetActiveStepUseCase(store);
    const complete = new CompleteStepUseCase(store);

    expect(setActive.execute("step.2").plan.steps.map((step) => step.status)).toEqual([
      "pending",
      "active",
      "pending",
    ]);
    complete.execute("step.2");
    complete.execute("step.3");
    const state = complete.execute("step.1");

    expect(state.status).toBe("completed");
    expect(state.progress).toEqual({
      totalSteps: 3,
      completedSteps: 3,
      failedSteps: 0,
      percentage: 100,
    });
    expect(state.plan.activeStepId).toBeUndefined();
  });

  it("tracks attempts and reveals hints independently per step", () => {
    const store = createStore();
    const recordAttempt = new RecordAttemptUseCase(store);
    const revealHint = new RevealHintUseCase(store);
    recordAttempt.execute("step.1", {
      id: "attempt.1",
      outcome: "failed",
      occurredAt: "2026-08-30T00:00:00.000Z",
      evidenceSummary: "The declared condition did not pass.",
    });
    recordAttempt.execute("step.1", {
      id: "attempt.1",
      outcome: "failed",
      occurredAt: "2026-08-30T00:00:00.000Z",
    });

    expect(revealHint.execute("step.1")).toEqual(
      expect.objectContaining({ hint: "Hint for step.1", hintIndex: 0 }),
    );
    expect(() => revealHint.execute("step.1")).toThrow("has no unrevealed hints");
    const step = store.getSnapshot().plan.steps[0];
    expect(step?.attempts).toHaveLength(1);
    expect(step?.revealedHintCount).toBe(1);
  });

  it("replaces and removes steps while retaining a valid active plan", () => {
    const store = createStore();
    const update = new UpdateLessonPlanUseCase(store);
    update.execute([{ type: "remove_step", stepId: "step.1" }]);

    expect(store.getSnapshot().plan.activeStepId).toBe("step.2");
    expect(store.getSnapshot().plan.steps[0]?.status).toBe("active");

    const replaced = update.execute([
      {
        type: "replace_steps",
        steps: [
          createStep("step.replacement-1", "criterion.replacement-1"),
          createStep("step.replacement-2", "criterion.replacement-2"),
        ],
      },
    ]);
    expect(replaced.plan.steps.map((step) => step.id)).toEqual([
      "step.replacement-1",
      "step.replacement-2",
    ]);
    expect(replaced.plan.activeStepId).toBe("step.replacement-1");
  });
});

function createStore(): LessonStore {
  return new LessonStore(
    createActiveLessonState(
      {
        id: "lesson.fake",
        title: "Fake lesson",
        objective: "Exercise lesson use cases.",
      },
      [
        createStep("step.1", "criterion.1"),
        createStep("step.2", "criterion.2"),
        createStep("step.3", "criterion.3"),
      ],
    ),
  );
}

function createStep(id: string, criterionId: string): LessonStepDefinition {
  return {
    id,
    title: `Title for ${id}`,
    objective: `Objective for ${id}`,
    criteria: [{ id: criterionId, validatorId: "validator.fake" }],
    hints: [`Hint for ${id}`],
  };
}

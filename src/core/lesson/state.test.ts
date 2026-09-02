import { describe, expect, it, vi } from "vitest";

import type { LessonState, LessonStepDefinition } from "./contracts";
import {
  createActiveLessonState,
  createLessonPlan,
  deriveLessonProgress,
  setLessonStepStatus,
} from "./state";
import { LessonStore } from "./store";

describe("lesson plan state", () => {
  it.each([3, 8])("creates an active provider-neutral %i-step plan", (stepCount) => {
    const plan = createLessonPlan(createSteps(stepCount));

    expect(plan.steps).toHaveLength(stepCount);
    expect(plan.activeStepId).toBe("step.1");
    expect(plan.steps[0]?.status).toBe("active");
    expect(plan.steps.slice(1).every((step) => step.status === "pending")).toBe(true);
  });

  it("enforces plan limits and unique step and criterion IDs", () => {
    expect(() => createLessonPlan([])).toThrow("at least one step");
    expect(() => createLessonPlan(createSteps(11))).toThrow("at most 10 steps");
    expect(() => createLessonPlan([createSteps(1)[0]!, createSteps(1)[0]!])).toThrow(
      'Lesson step ID "step.1" must be unique.',
    );
    const steps = createSteps(2).map((step) => ({
      ...step,
      criteria: [{ ...step.criteria[0]!, id: "criterion.shared" }],
    }));
    expect(() => createLessonPlan(steps)).toThrow(
      'Lesson criterion ID "criterion.shared" must be unique.',
    );
  });

  it("keeps a single active step and derives progress from step states", () => {
    const plan = createLessonPlan(createSteps(3));
    const completedFirst = setLessonStepStatus(plan, "step.1", "completed");
    const activeSecond = setLessonStepStatus(completedFirst, "step.2", "active");
    const failedThird = setLessonStepStatus(activeSecond, "step.3", "failed");

    expect(activeSecond.steps.map((step) => step.status)).toEqual([
      "completed",
      "active",
      "pending",
    ]);
    expect(failedThird.activeStepId).toBe("step.2");
    expect(deriveLessonProgress(failedThird)).toEqual({
      totalSteps: 3,
      completedSteps: 1,
      failedSteps: 1,
      percentage: 33,
    });
  });

  it("rejects transitions for unknown steps without changing the plan", () => {
    const plan = createLessonPlan(createSteps(3));

    expect(() => setLessonStepStatus(plan, "step.missing", "active")).toThrow(
      'Lesson step "step.missing" is not registered in the plan.',
    );
    expect(plan.steps.map((step) => step.status)).toEqual([
      "active",
      "pending",
      "pending",
    ]);
  });
});

describe("LessonStore", () => {
  it("adapts lesson state through vanilla Zustand with defensive commits", () => {
    const initialState = createActiveLessonState(
      {
        id: "lesson.fake",
        title: "Fake provider lesson",
        objective: "Keep the state provider-neutral.",
      },
      createSteps(3),
    );
    const store = new LessonStore(initialState);
    const listener = vi.fn();
    store.subscribe(listener);
    const nextState: LessonState = {
      ...store.getSnapshot(),
      agent: { status: "waiting" as const },
      revision: 2,
    };

    store.commit(nextState);
    nextState.agent.status = "error";

    expect(store.getSnapshot().agent.status).toBe("waiting");
    expect(store.getSnapshot().progress.totalSteps).toBe(3);
    expect(listener).toHaveBeenCalledOnce();
  });
});

function createSteps(count: number): LessonStepDefinition[] {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      id: `step.${number}`,
      title: `Step ${number}`,
      objective: `Complete step ${number}.`,
      criteria: [
        {
          id: `criterion.${number}`,
          validatorId: "validator.fake",
          input: { expected: number },
        },
      ],
      hints: [`Hint ${number}`],
    };
  });
}

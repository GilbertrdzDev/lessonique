import type {
  LessonAttempt,
  LessonPlanOperation,
  LessonPlanState,
  LessonState,
  LessonStepDefinition,
  LessonStepPatch,
  LessonStepState,
  LessonStoreAdapter,
} from "./contracts";
import {
  cloneLessonState,
  createLessonPlan,
  deriveLessonProgress,
  setLessonStepStatus,
} from "./state";

export class UpdateLessonPlanUseCase {
  readonly #store: LessonStoreAdapter;

  constructor(store: LessonStoreAdapter) {
    this.#store = store;
  }

  execute(operations: readonly LessonPlanOperation[]): LessonState {
    if (operations.length === 0) {
      throw new Error("At least one lesson plan operation is required.");
    }
    const current = requireLesson(this.#store.getSnapshot());
    let plan = cloneLessonState(current).plan;
    let agent = cloneLessonState(current).agent;

    operations.forEach((operation) => {
      switch (operation.type) {
        case "replace_steps":
          plan = createLessonPlan(operation.steps);
          break;
        case "insert_step":
          plan = insertLessonStep(plan, operation.step, operation.afterStepId);
          break;
        case "update_step":
          plan = updateLessonStep(plan, operation.stepId, operation.patch);
          break;
        case "remove_step":
          plan = removeLessonStep(plan, operation.stepId);
          break;
        case "set_active_step":
          plan = setLessonStepStatus(plan, operation.stepId, "active");
          break;
        case "set_agent_message":
          agent = { ...agent, message: operation.message };
          break;
      }
    });

    validatePlan(plan);
    const nextState: LessonState = {
      ...current,
      plan: {
        ...plan,
        revision: current.plan.revision + 1,
      },
      progress: deriveLessonProgress(plan),
      agent,
      revision: current.revision + 1,
    };
    this.#store.commit(nextState);
    return this.#store.getSnapshot();
  }
}

export class SetActiveStepUseCase {
  readonly #updatePlan: UpdateLessonPlanUseCase;

  constructor(store: LessonStoreAdapter) {
    this.#updatePlan = new UpdateLessonPlanUseCase(store);
  }

  execute(stepId: string): LessonState {
    return this.#updatePlan.execute([{ type: "set_active_step", stepId }]);
  }
}

export class CompleteStepUseCase {
  readonly #store: LessonStoreAdapter;

  constructor(store: LessonStoreAdapter) {
    this.#store = store;
  }

  execute(stepId?: string): LessonState {
    const current = requireLesson(this.#store.getSnapshot());
    const selectedStepId = stepId ?? current.plan.activeStepId;
    if (!selectedStepId) {
      throw new Error("The lesson does not have an active step to complete.");
    }
    const selectedIndex = current.plan.steps.findIndex(
      (step) => step.id === selectedStepId,
    );
    if (selectedIndex < 0) {
      throw new Error(`Lesson step "${selectedStepId}" is not registered in the plan.`);
    }
    if (current.plan.steps[selectedIndex]?.status === "completed") {
      return current;
    }

    let plan = setLessonStepStatus(current.plan, selectedStepId, "completed");
    const nextStep = [
      ...plan.steps.slice(selectedIndex + 1),
      ...plan.steps.slice(0, selectedIndex),
    ].find((step) => step.status === "pending");
    if (nextStep) {
      plan = setLessonStepStatus(plan, nextStep.id, "active");
    }
    const progress = deriveLessonProgress(plan);
    const lessonCompleted = progress.completedSteps === progress.totalSteps;
    const nextState: LessonState = {
      ...current,
      status: lessonCompleted ? "completed" : current.status,
      plan: {
        ...plan,
        revision: current.plan.revision + 1,
      },
      progress,
      agent: lessonCompleted ? { ...current.agent, status: "idle" } : current.agent,
      revision: current.revision + 1,
    };
    this.#store.commit(nextState);
    return this.#store.getSnapshot();
  }
}

export class RecordAttemptUseCase {
  readonly #store: LessonStoreAdapter;

  constructor(store: LessonStoreAdapter) {
    this.#store = store;
  }

  execute(stepId: string, attempt: LessonAttempt): LessonState {
    const current = requireLesson(this.#store.getSnapshot());
    const step = current.plan.steps.find((candidate) => candidate.id === stepId);
    if (!step) {
      throw new Error(`Lesson step "${stepId}" is not registered in the plan.`);
    }
    if (step.attempts.some((candidate) => candidate.id === attempt.id)) {
      return current;
    }
    const nextState: LessonState = {
      ...current,
      plan: {
        ...current.plan,
        steps: current.plan.steps.map((candidate) =>
          candidate.id === stepId
            ? {
                ...candidate,
                attempts: [...candidate.attempts, structuredClone(attempt)],
              }
            : candidate,
        ),
        revision: current.plan.revision + 1,
      },
      revision: current.revision + 1,
    };
    this.#store.commit(nextState);
    return this.#store.getSnapshot();
  }
}

export type RevealHintResult = {
  state: LessonState;
  hint: string;
  hintIndex: number;
};

export class RevealHintUseCase {
  readonly #store: LessonStoreAdapter;

  constructor(store: LessonStoreAdapter) {
    this.#store = store;
  }

  execute(stepId: string): RevealHintResult {
    const current = requireLesson(this.#store.getSnapshot());
    const step = current.plan.steps.find((candidate) => candidate.id === stepId);
    if (!step) {
      throw new Error(`Lesson step "${stepId}" is not registered in the plan.`);
    }
    const hintIndex = step.revealedHintCount;
    const hint = step.hints[hintIndex];
    if (!hint) {
      throw new Error(`Lesson step "${stepId}" has no unrevealed hints.`);
    }
    const nextState: LessonState = {
      ...current,
      plan: {
        ...current.plan,
        steps: current.plan.steps.map((candidate) =>
          candidate.id === stepId
            ? { ...candidate, revealedHintCount: hintIndex + 1 }
            : candidate,
        ),
        revision: current.plan.revision + 1,
      },
      revision: current.revision + 1,
    };
    this.#store.commit(nextState);
    return {
      state: this.#store.getSnapshot(),
      hint,
      hintIndex,
    };
  }
}

function insertLessonStep(
  plan: LessonPlanState,
  definition: LessonStepDefinition,
  afterStepId?: string,
): LessonPlanState {
  const step = createStepState(definition);
  const insertAt = afterStepId
    ? requireStepIndex(plan, afterStepId) + 1
    : plan.steps.length;
  return {
    ...plan,
    steps: [...plan.steps.slice(0, insertAt), step, ...plan.steps.slice(insertAt)],
  };
}

function updateLessonStep(
  plan: LessonPlanState,
  stepId: string,
  patch: LessonStepPatch,
): LessonPlanState {
  requireStepIndex(plan, stepId);
  return {
    ...plan,
    steps: plan.steps.map((step) =>
      step.id === stepId
        ? {
            ...step,
            ...structuredClone(patch),
            revealedHintCount: patch.hints
              ? Math.min(step.revealedHintCount, patch.hints.length)
              : step.revealedHintCount,
          }
        : step,
    ),
  };
}

function removeLessonStep(plan: LessonPlanState, stepId: string): LessonPlanState {
  if (plan.steps.length === 1) {
    throw new Error("A lesson plan must retain at least one step.");
  }
  const removeAt = requireStepIndex(plan, stepId);
  let steps = plan.steps.filter((step) => step.id !== stepId);
  let activeStepId = plan.activeStepId === stepId ? undefined : plan.activeStepId;
  if (!activeStepId) {
    const replacement = steps[Math.min(removeAt, steps.length - 1)];
    if (replacement) {
      steps = steps.map((step) => ({
        ...step,
        status: step.id === replacement.id ? "active" : step.status,
      }));
      activeStepId = replacement.id;
    }
  }
  return {
    ...plan,
    steps,
    ...(activeStepId ? { activeStepId } : {}),
  };
}

function createStepState(definition: LessonStepDefinition): LessonStepState {
  return {
    ...structuredClone(definition),
    status: "pending",
    attempts: [],
    revealedHintCount: 0,
  };
}

function requireStepIndex(plan: LessonPlanState, stepId: string): number {
  const index = plan.steps.findIndex((step) => step.id === stepId);
  if (index < 0) {
    throw new Error(`Lesson step "${stepId}" is not registered in the plan.`);
  }
  return index;
}

function validatePlan(plan: LessonPlanState): void {
  createLessonPlan(plan.steps.map(toStepDefinition));
  const activeSteps = plan.steps.filter((step) => step.status === "active");
  if (activeSteps.length > 1 || activeSteps[0]?.id !== plan.activeStepId) {
    throw new Error("A lesson plan must have at most one matching active step.");
  }
}

function toStepDefinition(step: LessonStepState): LessonStepDefinition {
  return {
    id: step.id,
    title: step.title,
    objective: step.objective,
    ...(step.instructions ? { instructions: step.instructions } : {}),
    criteria: structuredClone(step.criteria),
    hints: [...step.hints],
  };
}

function requireLesson(state: LessonState): LessonState {
  if (!state.lesson) {
    throw new Error("No guided lesson is active.");
  }
  return state;
}

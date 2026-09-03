import type {
  LessonState,
  LessonStepStatus,
  LessonStoreAdapter,
} from "./contracts";
import { deriveLessonProgress } from "./state";

export class GuidanceProgressCoordinator {
  readonly #store: LessonStoreAdapter;

  constructor(store: LessonStoreAdapter) {
    this.#store = store;
  }

  enterSection(
    orderedStepIds: readonly string[],
    activeStepId: string | undefined,
  ): LessonState {
    if (!activeStepId) return this.#store.getSnapshot();
    const managedStepIds = uniqueStepIds(orderedStepIds);
    const activeIndex = managedStepIds.indexOf(activeStepId);
    if (activeIndex < 0) {
      throw new Error(
        `Guidance section "${activeStepId}" is not part of the active scene.`,
      );
    }

    return this.#commitProgress(managedStepIds, (stepId, managedIndex) =>
      managedIndex < activeIndex
        ? "completed"
        : stepId === activeStepId
          ? "active"
          : "pending",
    );
  }

  completeSections(orderedStepIds: readonly string[]): LessonState {
    const managedStepIds = uniqueStepIds(orderedStepIds);
    if (managedStepIds.length === 0) return this.#store.getSnapshot();
    return this.#commitProgress(managedStepIds, () => "completed");
  }

  completeSection(
    orderedStepIds: readonly string[],
    completedStepId: string,
  ): LessonState {
    const managedStepIds = uniqueStepIds(orderedStepIds);
    const completedIndex = managedStepIds.indexOf(completedStepId);
    if (completedIndex < 0) {
      throw new Error(
        `Guidance section "${completedStepId}" is not part of the active scene.`,
      );
    }
    return this.#commitProgress(managedStepIds, (_stepId, managedIndex) =>
      managedIndex <= completedIndex
        ? "completed"
        : managedIndex === completedIndex + 1
          ? "active"
          : "pending",
    );
  }

  #commitProgress(
    managedStepIds: readonly string[],
    resolveManagedStatus: (
      stepId: string,
      managedIndex: number,
    ) => LessonStepStatus,
  ): LessonState {
    const current = this.#store.getSnapshot();
    const managedIndexes = new Map(
      managedStepIds.map((stepId, index) => [stepId, index]),
    );
    managedStepIds.forEach((stepId) => {
      if (!current.plan.steps.some(({ id }) => id === stepId)) {
        throw new Error(
          `Guidance section "${stepId}" is not registered in the lesson plan.`,
        );
      }
    });

    let activeStepId: string | undefined;
    let steps = current.plan.steps.map((step) => {
      const managedIndex = managedIndexes.get(step.id);
      if (managedIndex !== undefined) {
        const status = resolveManagedStatus(step.id, managedIndex);
        if (status === "active") activeStepId = step.id;
        return { ...step, status };
      }
      if (step.status === "active") return { ...step, status: "pending" as const };
      return step;
    });

    if (!activeStepId) {
      const nextStep = steps.find(({ status }) => status !== "completed");
      if (nextStep) {
        activeStepId = nextStep.id;
        steps = steps.map((step) =>
          step.id === activeStepId ? { ...step, status: "active" as const } : step,
        );
      }
    }

    const plan = {
      ...current.plan,
      steps,
      ...(activeStepId ? { activeStepId } : { activeStepId: undefined }),
      revision: current.plan.revision + 1,
    };
    const progress = deriveLessonProgress(plan);
    const completed =
      progress.totalSteps > 0 && progress.completedSteps === progress.totalSteps;
    const nextState: LessonState = {
      ...current,
      status: completed ? "completed" : "active",
      plan,
      progress,
      agent: completed ? { ...current.agent, status: "idle" } : current.agent,
      revision: current.revision + 1,
    };
    this.#store.commit(nextState);
    return this.#store.getSnapshot();
  }
}

function uniqueStepIds(stepIds: readonly string[]): string[] {
  return [...new Set(stepIds)];
}

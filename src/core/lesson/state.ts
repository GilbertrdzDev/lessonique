import { DEFAULT_SYSTEM_LIMITS } from "@/core/platform/contracts";

import type {
  LessonDefinition,
  LessonPlanState,
  LessonProgress,
  LessonState,
  LessonStepDefinition,
  LessonStepStatus,
} from "./contracts";

export function createIdleLessonState(): LessonState {
  return {
    status: "idle",
    plan: {
      steps: [],
      revision: 0,
    },
    progress: {
      totalSteps: 0,
      completedSteps: 0,
      failedSteps: 0,
      percentage: 0,
    },
    agent: {
      status: "idle",
    },
    activity: [],
    interactions: [],
    waits: [],
    revision: 0,
  };
}

export function createActiveLessonState(
  lesson: LessonDefinition,
  steps: readonly LessonStepDefinition[],
): LessonState {
  const plan = createLessonPlan(steps);
  return {
    ...createIdleLessonState(),
    status: "active",
    lesson: { ...lesson },
    plan,
    progress: deriveLessonProgress(plan),
    agent: {
      status: "working",
    },
    revision: 1,
  };
}

export function createLessonPlan(
  definitions: readonly LessonStepDefinition[],
): LessonPlanState {
  assertValidStepDefinitions(definitions);
  return {
    activeStepId: definitions[0]?.id,
    steps: definitions.map((definition, index) => ({
      ...cloneStepDefinition(definition),
      status: index === 0 ? "active" : "pending",
      attempts: [],
      revealedHintCount: 0,
    })),
    revision: 1,
  };
}

export function setLessonStepStatus(
  plan: LessonPlanState,
  stepId: string,
  status: LessonStepStatus,
): LessonPlanState {
  const current = plan.steps.find((step) => step.id === stepId);
  if (!current) {
    throw new Error(`Lesson step "${stepId}" is not registered in the plan.`);
  }
  if (current.status === status) {
    return plan;
  }

  const nextSteps = plan.steps.map((step) => {
    if (step.id === stepId) {
      return { ...step, status };
    }
    if (status === "active" && step.status === "active") {
      return { ...step, status: "pending" as const };
    }
    return step;
  });

  return {
    steps: nextSteps,
    ...(status === "active"
      ? { activeStepId: stepId }
      : plan.activeStepId === stepId
        ? {}
        : { activeStepId: plan.activeStepId }),
    revision: plan.revision + 1,
  };
}

export function deriveLessonProgress(plan: LessonPlanState): LessonProgress {
  const completedSteps = plan.steps.filter(
    (step) => step.status === "completed",
  ).length;
  const failedSteps = plan.steps.filter((step) => step.status === "failed").length;
  const totalSteps = plan.steps.length;
  return {
    totalSteps,
    completedSteps,
    failedSteps,
    percentage: totalSteps === 0 ? 0 : Math.round((completedSteps / totalSteps) * 100),
  };
}

export function cloneLessonState(state: LessonState): LessonState {
  return structuredClone(state);
}

function assertValidStepDefinitions(
  definitions: readonly LessonStepDefinition[],
): void {
  if (definitions.length === 0) {
    throw new Error("A lesson plan requires at least one step.");
  }
  if (definitions.length > DEFAULT_SYSTEM_LIMITS.maxLessonSteps) {
    throw new Error(
      `A lesson plan supports at most ${DEFAULT_SYSTEM_LIMITS.maxLessonSteps} steps.`,
    );
  }
  const stepIds = new Set<string>();
  const criterionIds = new Set<string>();
  definitions.forEach((step) => {
    if (stepIds.has(step.id)) {
      throw new Error(`Lesson step ID "${step.id}" must be unique.`);
    }
    stepIds.add(step.id);
    step.criteria.forEach((criterion) => {
      if (criterionIds.has(criterion.id)) {
        throw new Error(`Lesson criterion ID "${criterion.id}" must be unique.`);
      }
      criterionIds.add(criterion.id);
    });
  });
}

function cloneStepDefinition(
  definition: LessonStepDefinition,
): LessonStepDefinition {
  return {
    ...definition,
    criteria: definition.criteria.map((criterion) => structuredClone(criterion)),
    hints: [...definition.hints],
  };
}

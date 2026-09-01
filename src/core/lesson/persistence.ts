import { z } from "zod";

import type { JsonValue } from "@/core/platform/json-schema";

import type { LessonState, LessonStepDefinition } from "./contracts";
import {
  createActiveLessonState,
  deriveLessonProgress,
} from "./state";

const PERSISTENCE_VERSION = 1;
const MAX_PERSISTED_BYTES = 500_000;

export interface LessonStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const criterionSchema = z.strictObject({
  id: z.string().min(1).max(120),
  validatorId: z.string().min(1).max(120),
  input: z.record(z.string(), jsonValueSchema).optional(),
});

const attemptSchema = z.strictObject({
  id: z.string().min(1).max(120),
  outcome: z.enum(["pending", "passed", "failed"]),
  occurredAt: z.string().min(1).max(80),
  evidenceSummary: z.string().max(300).optional(),
});

const stepSchema = z.strictObject({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(120),
  objective: z.string().min(1).max(300),
  instructions: z.string().max(1_000).optional(),
  criteria: z.array(criterionSchema).max(30),
  hints: z.array(z.string().max(300)).max(20),
  status: z.enum(["pending", "active", "completed", "failed", "locked"]),
  attempts: z.array(attemptSchema).max(100),
  revealedHintCount: z.number().int().min(0).max(20),
});

const persistedLessonSchema = z.strictObject({
  version: z.literal(PERSISTENCE_VERSION),
  status: z.enum(["active", "completed"]),
  lesson: z.strictObject({
    id: z.string().min(1).max(120),
    title: z.string().min(1).max(120),
    objective: z.string().min(1).max(300),
    description: z.string().max(1_000).optional(),
    locale: z.string().max(20).optional(),
  }),
  steps: z.array(stepSchema).min(1).max(10),
  activeStepId: z.string().min(1).max(120).optional(),
  agentMessage: z.string().max(500).optional(),
  revision: z.number().int().min(0),
});

export class LessonPersistence {
  readonly #storage: LessonStorage;
  readonly #key: string;

  constructor(storage: LessonStorage, key = "lessonique.lesson.v1") {
    this.#storage = storage;
    this.#key = key;
  }

  save(state: LessonState): boolean {
    if (
      !state.lesson ||
      (state.status !== "active" && state.status !== "completed")
    ) {
      return false;
    }
    const payload = {
      version: PERSISTENCE_VERSION,
      status: state.status,
      lesson: state.lesson,
      steps: state.plan.steps,
      ...(state.plan.activeStepId
        ? { activeStepId: state.plan.activeStepId }
        : {}),
      ...(state.agent.message ? { agentMessage: state.agent.message } : {}),
      revision: state.revision,
    };
    try {
      this.#storage.setItem(this.#key, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  load(): LessonState | undefined {
    try {
      const serialized = this.#storage.getItem(this.#key);
      if (!serialized || serialized.length > MAX_PERSISTED_BYTES) {
        return undefined;
      }
      const persisted = persistedLessonSchema.parse(JSON.parse(serialized));
      return restoreLessonState(persisted);
    } catch {
      return undefined;
    }
  }

  clear(): boolean {
    try {
      this.#storage.removeItem(this.#key);
      return true;
    } catch {
      return false;
    }
  }
}

function restoreLessonState(
  persisted: z.infer<typeof persistedLessonSchema>,
): LessonState {
  const definitions: LessonStepDefinition[] = persisted.steps.map((step) => ({
    id: step.id,
    title: step.title,
    objective: step.objective,
    ...(step.instructions ? { instructions: step.instructions } : {}),
    criteria: step.criteria.map((criterion) => structuredClone(criterion)),
    hints: [...step.hints],
  }));
  const base = createActiveLessonState(persisted.lesson, definitions);
  const activeStepId =
    persisted.status === "active" &&
    persisted.activeStepId &&
    persisted.steps.some(({ id }) => id === persisted.activeStepId)
      ? persisted.activeStepId
      : undefined;
  const steps = base.plan.steps.map((step) => {
    const stored = persisted.steps.find(({ id }) => id === step.id);
    const storedStatus = stored?.status ?? "pending";
    const status =
      activeStepId === step.id
        ? ("active" as const)
        : storedStatus === "active"
          ? ("pending" as const)
          : storedStatus;
    return {
      ...step,
      status,
      attempts: stored?.attempts.map((attempt) => ({ ...attempt })) ?? [],
      revealedHintCount: Math.min(
        stored?.revealedHintCount ?? 0,
        step.hints.length,
      ),
    };
  });
  const plan = {
    steps,
    ...(activeStepId ? { activeStepId } : {}),
    revision: Math.max(1, persisted.revision),
  };
  return {
    ...base,
    status: persisted.status,
    plan,
    progress: deriveLessonProgress(plan),
    agent: {
      status: persisted.status === "completed" ? "idle" : "waiting",
      ...(persisted.agentMessage ? { message: persisted.agentMessage } : {}),
    },
    revision: persisted.revision,
  };
}

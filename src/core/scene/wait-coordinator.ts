import type {
  ValidationEngine,
  ValidationResult,
} from "@/core/code-intelligence";
import type {
  InteractionTracker,
  LessonStoreAdapter,
  LocalWaitCondition,
} from "@/core/lesson";
import {
  RecordAttemptUseCase,
  RevealHintUseCase,
} from "@/core/lesson";

export type WaitCoordinatorResult = {
  status: "satisfied" | "timed-out" | "cancelled";
  outcome: "success" | "warning" | "cancelled";
  eventId?: string;
  validation?: ValidationResult;
  hint?: string;
};

export class WaitCoordinator {
  readonly #interactions: InteractionTracker;
  readonly #validation: ValidationEngine;
  readonly #lesson: LessonStoreAdapter;
  readonly #attempts: RecordAttemptUseCase;
  readonly #hints: RevealHintUseCase;
  readonly #now: () => string;
  #attemptSequence = 0;

  constructor(options: {
    interactions: InteractionTracker;
    validation: ValidationEngine;
    lesson: LessonStoreAdapter;
    now?: () => string;
  }) {
    this.#interactions = options.interactions;
    this.#validation = options.validation;
    this.#lesson = options.lesson;
    this.#attempts = new RecordAttemptUseCase(options.lesson);
    this.#hints = new RevealHintUseCase(options.lesson);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async waitFor(
    id: string,
    condition: LocalWaitCondition,
    signal: AbortSignal,
  ): Promise<WaitCoordinatorResult> {
    if (condition.kind === "interaction") {
      const result = await this.#interactions.waitFor(id, condition, signal);
      if (result.status === "cancelled") {
        return { status: "cancelled", outcome: "cancelled" };
      }
      if (result.status === "timed-out") {
        return {
          status: "timed-out",
          outcome: "warning",
          ...this.#revealHint(condition.lessonStepId),
        };
      }
      const failed = result.event?.outcome === "failure";
      this.#recordOutcome(
        condition.lessonStepId,
        failed ? "failed" : "passed",
        result.event?.summary,
      );
      return {
        status: "satisfied",
        outcome: failed ? "warning" : "success",
        ...(result.event ? { eventId: result.event.id } : {}),
        ...(failed ? this.#revealHint(condition.lessonStepId) : {}),
      };
    }

    const { criterion, stepId } = this.#resolveCriterion(condition);
    const result = await this.#validation.waitFor(
      {
        id: criterion.id,
        validatorId: criterion.validatorId,
        input: criterion.input ?? {},
        ...(typeof criterion.input?.filePath === "string"
          ? { filePath: criterion.input.filePath }
          : {}),
      },
      { timeoutMs: condition.timeoutMs },
      signal,
    );
    if (result.status === "cancelled") {
      return {
        status: "cancelled",
        outcome: "cancelled",
        validation: result.result,
      };
    }
    const passed = result.status === "satisfied";
    this.#recordOutcome(
      stepId,
      passed ? "passed" : "failed",
      result.result.evidence.map(({ summary }) => summary).join(" "),
    );
    return {
      status: result.status,
      outcome: passed ? "success" : "warning",
      validation: result.result,
      ...(passed ? {} : this.#revealHint(stepId)),
    };
  }

  #resolveCriterion(
    condition: Extract<LocalWaitCondition, { kind: "validation" }>,
  ) {
    const state = this.#lesson.getSnapshot();
    const stepId = condition.lessonStepId ?? state.plan.activeStepId;
    const step = state.plan.steps.find(({ id }) => id === stepId);
    if (!step) {
      throw new Error("A validation wait requires an active registered lesson step.");
    }
    const criterion = step.criteria.find(({ id }) => id === condition.criterionId);
    if (!criterion) {
      throw new Error(
        `Lesson criterion "${condition.criterionId}" is not registered on step "${step.id}".`,
      );
    }
    return { criterion, stepId: step.id };
  }

  #recordOutcome(
    stepId: string | undefined,
    outcome: "passed" | "failed",
    evidenceSummary?: string,
  ): void {
    if (!stepId) return;
    this.#attempts.execute(stepId, {
      id: `scene-attempt-${++this.#attemptSequence}`,
      outcome,
      occurredAt: this.#now(),
      ...(evidenceSummary ? { evidenceSummary } : {}),
    });
  }

  #revealHint(stepId: string | undefined): { hint?: string } {
    if (!stepId) return {};
    try {
      return { hint: this.#hints.execute(stepId).hint };
    } catch {
      return {};
    }
  }
}

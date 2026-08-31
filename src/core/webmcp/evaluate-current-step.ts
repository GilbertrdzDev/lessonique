import type {
  ValidationEngine,
  ValidationResult,
} from "@/core/code-intelligence";
import {
  CompleteStepUseCase,
  LessonActivityService,
  RecordAttemptUseCase,
  type AssistantIntentMapper,
  type LessonState,
  type LessonStepState,
  type LessonStoreAdapter,
} from "@/core/lesson";
import {
  SchemaValidationError,
  validateClosedJsonObjectInput,
} from "@/core/platform/json-schema";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";

import type {
  EvaluateCurrentStepInput,
  ToolExecutionResult,
} from "./contracts";
import { ToolInvocationError } from "./tool-invocation-service";

export type EvaluateCurrentStepData = ReturnType<typeof toEvaluationData>;

export class EvaluateCurrentStepService {
  readonly #lesson: LessonStoreAdapter;
  readonly #validation: ValidationEngine;
  readonly #registries: ProviderPlatformRegistries;
  readonly #assistantIntents: AssistantIntentMapper;
  readonly #attempts: RecordAttemptUseCase;
  readonly #complete: CompleteStepUseCase;
  readonly #activity: LessonActivityService;
  readonly #now: () => string;
  #attemptSequence = 0;

  constructor(options: {
    lesson: LessonStoreAdapter;
    validation: ValidationEngine;
    registries: ProviderPlatformRegistries;
    assistantIntents: AssistantIntentMapper;
    now?: () => string;
  }) {
    this.#lesson = options.lesson;
    this.#validation = options.validation;
    this.#registries = options.registries;
    this.#assistantIntents = options.assistantIntents;
    this.#attempts = new RecordAttemptUseCase(options.lesson);
    this.#complete = new CompleteStepUseCase(options.lesson);
    this.#activity = new LessonActivityService(options.lesson);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  validate(input: EvaluateCurrentStepInput): LessonStepState {
    const state = this.#lesson.getSnapshot();
    if (!state.lesson) {
      throw new ToolInvocationError({
        code: "no_active_lesson",
        message: "A guided lesson must be active before evaluating a step.",
        recoverable: true,
      });
    }
    const stepId = input.stepId ?? state.plan.activeStepId;
    const step = state.plan.steps.find(({ id }) => id === stepId);
    if (!step) {
      throw new ToolInvocationError({
        code: "invalid_lesson_step",
        message: stepId
          ? `Lesson step "${stepId}" is not registered in the active plan.`
          : "The active lesson does not have a current step.",
        recoverable: true,
        supportedAlternatives: state.plan.steps.map(({ id }) => id),
      });
    }
    if (step.criteria.length === 0) {
      throw new ToolInvocationError({
        code: "no_declared_criteria",
        message: `Lesson step "${step.id}" has no declared validation criteria.`,
        recoverable: true,
      });
    }
    step.criteria.forEach((criterion) => {
      const definition = this.#registries.validators.get(criterion.validatorId);
      if (!definition) {
        throw new ToolInvocationError({
          code: "unsupported_validator",
          message: `Validator "${criterion.validatorId}" is not registered.`,
          recoverable: true,
          supportedAlternatives: this.#registries.validators
            .list()
            .map(({ id }) => id),
        });
      }
      try {
        validateClosedJsonObjectInput(
          definition.inputSchema,
          criterion.input ?? {},
          `Criterion "${criterion.id}" input`,
        );
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          throw new ToolInvocationError({
            code: "invalid_criterion",
            message: error.message,
            recoverable: true,
          });
        }
        throw error;
      }
    });
    return step;
  }

  async execute(
    input: EvaluateCurrentStepInput,
    signal: AbortSignal,
  ): Promise<ToolExecutionResult<EvaluateCurrentStepData>> {
    const step = this.validate(input);
    const showFeedback = input.showFeedback ?? true;
    const agentBeforeEvaluation = structuredClone(
      this.#lesson.getSnapshot().agent,
    );
    if (showFeedback) {
      const state = this.#lesson.getSnapshot();
      this.#activity.setAgentState({
        status: "working",
        assistantIntent: this.#assistantIntents.thinking(step.id),
        ...(state.agent.message ? { message: state.agent.message } : {}),
      });
    }

    let results: ValidationResult[];
    try {
      results = await Promise.all(
        step.criteria.map((criterion) =>
          this.#validation.evaluate(
            {
              id: criterion.id,
              validatorId: criterion.validatorId,
              input: criterion.input ?? {},
              ...(typeof criterion.input?.filePath === "string"
                ? { filePath: criterion.input.filePath }
                : {}),
            },
            signal,
          ),
        ),
      );
    } catch (error) {
      if (showFeedback) {
        this.#activity.setAgentState(agentBeforeEvaluation);
      }
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ToolInvocationError({
        code: "evaluation_failed",
        message:
          error instanceof Error
            ? error.message
            : "The lesson step could not be evaluated.",
        recoverable: true,
      });
    }

    const passed = results.every(({ status }) => status === "passed");
    const occurredAt = this.#now();
    const attemptId = `evaluation-attempt-${++this.#attemptSequence}`;
    this.#attempts.execute(step.id, {
      id: attemptId,
      outcome: passed ? "passed" : "failed",
      occurredAt,
      evidenceSummary: summarizeEvidence(results),
    });
    this.#activity.recordActivity({
      id: `evaluation-activity-${this.#attemptSequence}`,
      typeId: "lesson.step-evaluated",
      source: "system",
      occurredAt,
      lessonStepId: step.id,
      outcome: passed ? "success" : "failure",
      summary: passed
        ? `All ${results.length} declared criteria passed.`
        : `${results.filter(({ status }) => status === "passed").length} of ${results.length} declared criteria passed.`,
    });

    const shouldAdvance = passed && (input.advanceOnPass ?? false);
    const wasCompleted = step.status === "completed";
    if (shouldAdvance) this.#complete.execute(step.id);
    if (showFeedback) {
      const state = this.#lesson.getSnapshot();
      const assistantIntent = this.#assistantIntents.fromOutcome(
        passed ? "success" : "failure",
        attemptId,
        step.id,
      );
      this.#activity.setAgentState({
        status: "working",
        ...(state.agent.message ? { message: state.agent.message } : {}),
        ...(assistantIntent ? { assistantIntent } : {}),
      });
    }

    const finalState = this.#lesson.getSnapshot();
    return {
      ok: true,
      status: "completed",
      revision: finalState.revision,
      data: toEvaluationData({
        state: finalState,
        stepId: step.id,
        attemptId,
        passed,
        advanced: shouldAdvance && !wasCompleted,
        feedbackShown: showFeedback,
        results,
      }),
    };
  }
}

function summarizeEvidence(results: readonly ValidationResult[]): string {
  const summary = results
    .flatMap(({ evidence }) => evidence.map(({ summary: item }) => item))
    .join(" ")
    .replaceAll(/\s+/gu, " ")
    .trim();
  return summary.slice(0, 500) || "No validation evidence was produced.";
}

function toEvaluationData(input: {
  state: LessonState;
  stepId: string;
  attemptId: string;
  passed: boolean;
  advanced: boolean;
  feedbackShown: boolean;
  results: readonly ValidationResult[];
}) {
  return {
    stepId: input.stepId,
    outcome: input.passed ? ("passed" as const) : ("failed" as const),
    passed: input.passed,
    advanced: input.advanced,
    feedbackShown: input.feedbackShown,
    attemptId: input.attemptId,
    criteria: input.results.map((result) => ({
      criterionId: result.conditionId,
      validatorId: result.validatorId,
      status: result.status,
      evidence: structuredClone(result.evidence),
      diagnosticIds: result.diagnostics.map(({ id }) => id),
      evaluatedAt: result.evaluatedAt,
    })),
    activeStepId: input.state.plan.activeStepId ?? null,
    progress: {
      completedSteps: input.state.progress.completedSteps,
      totalSteps: input.state.progress.totalSteps,
      percentage: input.state.progress.percentage,
    },
  };
}

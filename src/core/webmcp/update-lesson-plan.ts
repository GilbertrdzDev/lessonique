import {
  LessonStore,
  UpdateLessonPlanUseCase,
  type LessonCriterion,
  type LessonPlanOperation,
  type LessonState,
  type LessonStepDefinition,
  type LessonStepPatch,
  type LessonStoreAdapter,
} from "@/core/lesson";
import {
  SchemaValidationError,
  validateClosedJsonObjectInput,
} from "@/core/platform/json-schema";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import type { WorkspaceStateReader } from "@/core/workspace";

import type {
  LessonStepInput,
  ToolExecutionResult,
  UpdateLessonPlanInput,
} from "./contracts";
import { ToolInvocationError } from "./tool-invocation-service";

export type UpdateLessonPlanData = ReturnType<typeof toUpdateData>;

export class UpdateLessonPlanService {
  readonly #lesson: LessonStoreAdapter;
  readonly #workspace: WorkspaceStateReader;
  readonly #registries: ProviderPlatformRegistries;
  readonly #update: UpdateLessonPlanUseCase;

  constructor(dependencies: {
    lesson: LessonStoreAdapter;
    workspace: WorkspaceStateReader;
    registries: ProviderPlatformRegistries;
  }) {
    this.#lesson = dependencies.lesson;
    this.#workspace = dependencies.workspace;
    this.#registries = dependencies.registries;
    this.#update = new UpdateLessonPlanUseCase(dependencies.lesson);
  }

  validate(input: UpdateLessonPlanInput): void {
    this.#prepare(input);
  }

  execute(
    input: UpdateLessonPlanInput,
  ): ToolExecutionResult<UpdateLessonPlanData> {
    const operations = this.#prepare(input);
    const environmentRevision =
      this.#workspace.getSnapshot().environmentRevision;
    let state: LessonState;
    try {
      state = this.#update.execute(operations);
    } catch (error) {
      throw normalizePlanUpdateError(error);
    }
    const workspaceAfter = this.#workspace.getSnapshot();
    if (workspaceAfter.environmentRevision !== environmentRevision) {
      throw new ToolInvocationError({
        code: "lesson_plan_workspace_mutation",
        message: "The lesson plan update changed the workspace unexpectedly.",
        recoverable: false,
      });
    }
    return {
      ok: true,
      status: "completed",
      revision: state.revision,
      data: toUpdateData(state, environmentRevision),
    };
  }

  #prepare(input: UpdateLessonPlanInput): LessonPlanOperation[] {
    const current = this.#lesson.getSnapshot();
    if (!current.lesson || current.status === "idle") {
      throw new ToolInvocationError({
        code: "no_active_lesson",
        message: "Create a guided lesson before updating its plan.",
        recoverable: true,
        supportedAlternatives: ["create_guided_lesson"],
      });
    }
    const operations = input.operations.map(toLessonPlanOperation);
    const languageIds = this.#workspace.getSnapshot().languageIds;
    operations.forEach((operation) => {
      if (operation.type === "replace_steps") {
        operation.steps.forEach((step) =>
          this.#validateCriteria(step.criteria, languageIds),
        );
      } else if (operation.type === "insert_step") {
        this.#validateCriteria(operation.step.criteria, languageIds);
      } else if (
        operation.type === "update_step" &&
        operation.patch.criteria
      ) {
        this.#validateCriteria(operation.patch.criteria, languageIds);
      }
    });

    try {
      new UpdateLessonPlanUseCase(new LessonStore(current)).execute(operations);
    } catch (error) {
      throw normalizePlanUpdateError(error);
    }
    return operations;
  }

  #validateCriteria(
    criteria: readonly LessonCriterion[],
    activeLanguageIds: readonly string[],
  ): void {
    criteria.forEach((criterion) => {
      const definition = this.#registries.validators.get(
        criterion.validatorId,
      );
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
      if (
        !definition.supportedLanguageIds.some((languageId) =>
          activeLanguageIds.includes(languageId),
        )
      ) {
        throw new ToolInvocationError({
          code: "unsupported_validator",
          message: `Validator "${criterion.validatorId}" does not support the active workspace languages.`,
          recoverable: true,
          supportedAlternatives: this.#registries.validators
            .list()
            .filter((candidate) =>
              candidate.supportedLanguageIds.some((languageId) =>
                activeLanguageIds.includes(languageId),
              ),
            )
            .map(({ id }) => id),
        });
      }
      try {
        validateClosedJsonObjectInput(
          definition.inputSchema,
          criterion.input ?? {},
          `Validator "${criterion.validatorId}" input`,
        );
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          throw new ToolInvocationError({
            code: "invalid_validator_input",
            message: error.message,
            recoverable: true,
          });
        }
        throw error;
      }
    });
  }
}

function toLessonPlanOperation(
  operation: UpdateLessonPlanInput["operations"][number],
): LessonPlanOperation {
  switch (operation.type) {
    case "replace_steps":
      return {
        type: operation.type,
        steps: operation.steps.map(toLessonStepDefinition),
      };
    case "insert_step":
      return {
        type: operation.type,
        step: toLessonStepDefinition(operation.step),
        ...(operation.afterStepId
          ? { afterStepId: operation.afterStepId }
          : {}),
      };
    case "update_step":
      return {
        type: operation.type,
        stepId: operation.stepId,
        patch: toLessonStepPatch(operation.patch),
      };
    case "remove_step":
      return { type: operation.type, stepId: operation.stepId };
    case "set_active_step":
      return { type: operation.type, stepId: operation.stepId };
    case "set_agent_message":
      return { type: operation.type, message: operation.message };
  }
}

function toLessonStepDefinition(step: LessonStepInput): LessonStepDefinition {
  return {
    id: step.id,
    title: step.title,
    objective: step.objective,
    ...(step.instructions ? { instructions: step.instructions } : {}),
    criteria: (step.criteria ?? []).map(toLessonCriterion),
    hints: [...(step.hints ?? [])],
  };
}

function toLessonStepPatch(
  patch: Extract<
    UpdateLessonPlanInput["operations"][number],
    { type: "update_step" }
  >["patch"],
): LessonStepPatch {
  return {
    ...(patch.title ? { title: patch.title } : {}),
    ...(patch.objective ? { objective: patch.objective } : {}),
    ...(patch.instructions ? { instructions: patch.instructions } : {}),
    ...(patch.criteria
      ? { criteria: patch.criteria.map(toLessonCriterion) }
      : {}),
    ...(patch.hints ? { hints: [...patch.hints] } : {}),
  };
}

function toLessonCriterion(
  criterion: NonNullable<LessonStepInput["criteria"]>[number],
): LessonCriterion {
  return {
    id: criterion.id,
    requirement: criterion.requirement,
    validatorId: criterion.validatorId,
    ...(criterion.input ? { input: structuredClone(criterion.input) } : {}),
  };
}

function toUpdateData(state: LessonState, environmentRevision: number) {
  return {
    lessonId: state.lesson!.id,
    activeStepId: state.plan.activeStepId ?? null,
    steps: state.plan.steps.map((step) => ({
      id: step.id,
      title: step.title,
      status: step.status,
      criterionIds: step.criteria.map(({ id }) => id),
      hintCount: step.hints.length,
    })),
    progress: { ...state.progress },
    agentMessage: state.agent.message ?? null,
    evidence: {
      lessonRevision: state.revision,
      planRevision: state.plan.revision,
      environmentRevision,
    },
  };
}

function normalizePlanUpdateError(error: unknown): ToolInvocationError {
  if (error instanceof ToolInvocationError) return error;
  return new ToolInvocationError({
    code: "invalid_lesson_plan_update",
    message:
      error instanceof Error
        ? error.message
        : "The lesson plan update is invalid.",
    recoverable: true,
  });
}

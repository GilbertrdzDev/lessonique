import type {
  EnvironmentProfile,
  SurfaceConfiguration,
} from "@/core/platform/contracts";
import {
  SchemaValidationError,
  validateClosedJsonObjectInput,
} from "@/core/platform/json-schema";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import {
  ClassroomCleanupError,
  CreateGuidedLessonUseCase,
  ResetClassroomUseCase,
  type ClassroomSnapshot,
  type CreateGuidedLessonCommand,
} from "@/core/lesson";
import type {
  WorkspaceEnvironmentConfiguration,
  WorkspaceFile,
} from "@/core/workspace/contracts";
import {
  WorkspaceController,
  WorkspaceValidationError,
} from "@/core/workspace/workspace-controller";

import { CapabilityValidator } from "./capabilities";
import type {
  CreateGuidedLessonInput,
  ResetClassroomInput,
  SurfaceConfigurationInput,
  ToolExecutionResult,
} from "./contracts";
import { ToolInvocationError } from "./tool-invocation-service";

export type CreateGuidedLessonData = ReturnType<typeof toClassroomData>;
export type ResetClassroomData = ReturnType<typeof toResetData>;

export class ClassroomToolService {
  readonly #workspace: WorkspaceController;
  readonly #registries: ProviderPlatformRegistries;
  readonly #validator: CapabilityValidator;
  readonly #createLesson: CreateGuidedLessonUseCase;
  readonly #resetClassroom: ResetClassroomUseCase;

  constructor(dependencies: {
    workspace: WorkspaceController;
    registries: ProviderPlatformRegistries;
    createLesson: CreateGuidedLessonUseCase;
    resetClassroom: ResetClassroomUseCase;
  }) {
    this.#workspace = dependencies.workspace;
    this.#registries = dependencies.registries;
    this.#validator = new CapabilityValidator(dependencies.registries);
    this.#createLesson = dependencies.createLesson;
    this.#resetClassroom = dependencies.resetClassroom;
  }

  validateCreate(input: CreateGuidedLessonInput): void {
    this.#prepareCreate(input);
  }

  async create(
    input: CreateGuidedLessonInput,
  ): Promise<ToolExecutionResult<CreateGuidedLessonData>> {
    const command = this.#prepareCreate(input);
    try {
      const snapshot = await this.#createLesson.execute(command);
      return {
        ok: true,
        status: "completed",
        revision: snapshot.lesson.revision,
        data: toClassroomData(snapshot),
      };
    } catch (error) {
      throw normalizeClassroomError(error);
    }
  }

  async reset(
    input: ResetClassroomInput,
  ): Promise<ToolExecutionResult<ResetClassroomData>> {
    try {
      const snapshot = await this.#resetClassroom.execute({
        scope: input.scope,
        preserve: { activity: input.preserve?.activity },
      });
      return {
        ok: true,
        status: "completed",
        revision: snapshot.lesson.revision,
        data: toResetData(input.scope, snapshot),
      };
    } catch (error) {
      throw normalizeClassroomError(error);
    }
  }

  #prepareCreate(input: CreateGuidedLessonInput): CreateGuidedLessonCommand {
    if (input.initialScene) {
      throw new ToolInvocationError({
        code: "scene_engine_unavailable",
        message:
          "Create the guided lesson without initialScene until the scene engine is available.",
        recoverable: true,
        supportedAlternatives: ["omit initialScene"],
      });
    }
    const profile = this.#validator.requireProfile(input.environment.profileId);
    const runtimeProviderId =
      input.environment.runtimeProviderId ?? profile.runtimeProviderId;
    this.#validator.requireRuntime(runtimeProviderId, profile.id);
    const languageIds = input.environment.languageIds
      ? [...input.environment.languageIds]
      : [...profile.defaultLanguageIds];
    assertUnique(languageIds, "language");
    languageIds.forEach((languageId) =>
      this.#validator.requireLanguage(languageId, profile.id),
    );

    const files = prepareFiles(input, profile, languageIds, this.#validator);
    const surfaces = prepareSurfaces(
      profile,
      input.environment.surfaces,
      this.#validator,
    );
    const activeFilePath = resolveActiveFile(files, input.environment.activeFile);
    const activeSurfaceId = resolveActiveSurface(
      surfaces,
      input.environment.activeSurfaceId,
    );
    validateCriteria(input, languageIds, this.#registries);

    const environment: WorkspaceEnvironmentConfiguration = {
      profileId: profile.id,
      runtimeProviderId,
      languageIds,
      files,
      surfaces,
      ...(activeFilePath ? { activeFilePath } : {}),
      ...(activeSurfaceId ? { activeSurfaceId } : {}),
      focusActiveSurface: true,
      clearConsole: true,
    };
    try {
      this.#workspace.validateEnvironmentConfiguration(environment);
    } catch (error) {
      throw normalizeClassroomError(error);
    }

    return {
      lesson: {
        id: input.lessonId,
        title: input.title,
        objective: input.objective,
        ...(input.description ? { description: input.description } : {}),
        ...(input.language ? { locale: input.language } : {}),
      },
      steps: input.steps.map((step) => ({
        id: step.id,
        title: step.title,
        objective: step.objective,
        ...(step.instructions ? { instructions: step.instructions } : {}),
        criteria: (step.criteria ?? []).map((criterion) => ({
          id: criterion.id,
          validatorId: criterion.validatorId,
          ...(criterion.input ? { input: structuredClone(criterion.input) } : {}),
        })),
        hints: [...(step.hints ?? [])],
      })),
      environment,
    };
  }
}

function prepareFiles(
  input: CreateGuidedLessonInput,
  profile: EnvironmentProfile,
  languageIds: readonly string[],
  validator: CapabilityValidator,
): WorkspaceFile[] {
  assertUnique(
    input.files.map(({ path }) => path),
    "workspace file",
  );
  return input.files.map((file) => {
    validator.requireLanguage(file.languageId, profile.id);
    if (!languageIds.includes(file.languageId)) {
      throw new ToolInvocationError({
        code: "invalid_lesson_environment",
        message: `Workspace file "${file.path}" requires selected language "${file.languageId}".`,
        recoverable: true,
        supportedAlternatives: profile.allowedLanguageIds,
      });
    }
    return {
      ...file,
      visible: file.visible ?? true,
    };
  });
}

function prepareSurfaces(
  profile: EnvironmentProfile,
  requested: readonly SurfaceConfigurationInput[] | undefined,
  validator: CapabilityValidator,
): SurfaceConfiguration[] {
  const surfaces = profile.defaultSurfaces.map(cloneSurfaceConfiguration);
  assertUnique(
    (requested ?? []).map(({ id }) => id),
    "surface",
  );
  requested?.forEach((patch) => {
    const index = surfaces.findIndex(({ id }) => id === patch.id);
    const previous = index >= 0 ? surfaces[index] : undefined;
    const next = mergeSurfaceConfiguration(previous, patch);
    if (index >= 0) surfaces[index] = next;
    else surfaces.push(next);
  });
  surfaces.forEach((surface) =>
    validator.validateSurface(
      {
        ...surface,
        options: surface.options?.map((option) => ({ ...option })),
      },
      profile.id,
    ),
  );
  return surfaces;
}

function validateCriteria(
  input: CreateGuidedLessonInput,
  languageIds: readonly string[],
  registries: ProviderPlatformRegistries,
): void {
  assertUnique(
    input.steps.flatMap((step) => (step.criteria ?? []).map(({ id }) => id)),
    "lesson criterion",
  );
  input.steps.forEach((step) => {
    step.criteria?.forEach((criterion) => {
      const definition = registries.validators.get(criterion.validatorId);
      if (!definition) {
        throw new ToolInvocationError({
          code: "unsupported_validator",
          message: `Validator "${criterion.validatorId}" is not registered.`,
          recoverable: true,
          supportedAlternatives: registries.validators.list().map(({ id }) => id),
        });
      }
      if (
        !definition.supportedLanguageIds.some((languageId) =>
          languageIds.includes(languageId),
        )
      ) {
        throw new ToolInvocationError({
          code: "unsupported_validator",
          message: `Validator "${criterion.validatorId}" does not support the selected languages.`,
          recoverable: true,
          supportedAlternatives: registries.validators
            .list()
            .filter((candidate) =>
              candidate.supportedLanguageIds.some((languageId) =>
                languageIds.includes(languageId),
              ),
            )
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
  });
}

function resolveActiveFile(
  files: readonly WorkspaceFile[],
  requested: string | undefined,
): string | undefined {
  if (requested) {
    const file = files.find(({ path }) => path === requested);
    if (!file?.visible) {
      throw new ToolInvocationError({
        code: "invalid_lesson_environment",
        message: `Active file "${requested}" must exist and be visible.`,
        recoverable: true,
        supportedAlternatives: files.filter(({ visible }) => visible).map(({ path }) => path),
      });
    }
    return file.path;
  }
  return files.find(({ visible }) => visible)?.path;
}

function resolveActiveSurface(
  surfaces: readonly SurfaceConfiguration[],
  requested: string | undefined,
): string | undefined {
  if (requested) {
    const surface = surfaces.find(({ id }) => id === requested);
    if (!surface || surface.visible === false) {
      throw new ToolInvocationError({
        code: "invalid_lesson_environment",
        message: `Active surface "${requested}" must be configured and visible.`,
        recoverable: true,
        supportedAlternatives: surfaces
          .filter(({ visible }) => visible !== false)
          .map(({ id }) => id),
      });
    }
    return surface.id;
  }
  return surfaces.find(({ visible }) => visible !== false)?.id;
}

function mergeSurfaceConfiguration(
  previous: SurfaceConfiguration | undefined,
  patch: SurfaceConfigurationInput,
): SurfaceConfiguration {
  const options = new Map(
    (previous?.options ?? []).map((option) => [option.optionId, { ...option }]),
  );
  patch.options?.forEach((option) => options.set(option.optionId, { ...option }));
  return {
    ...(previous ?? { id: patch.id }),
    ...patch,
    options: [...options.values()],
  };
}

function cloneSurfaceConfiguration(
  surface: SurfaceConfiguration,
): SurfaceConfiguration {
  return {
    ...surface,
    options: surface.options?.map((option) => ({ ...option })),
  };
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) {
      throw new ToolInvocationError({
        code: "invalid_lesson",
        message: `The ${label} "${value}" is specified more than once.`,
        recoverable: true,
      });
    }
    seen.add(value);
  });
}

function normalizeClassroomError(error: unknown): Error {
  if (error instanceof ToolInvocationError) return error;
  if (error instanceof WorkspaceValidationError) {
    return new ToolInvocationError({
      code: "invalid_lesson_environment",
      message: error.message,
      recoverable: true,
    });
  }
  if (error instanceof ClassroomCleanupError) {
    return new ToolInvocationError({
      code: "classroom_cleanup_failed",
      message: error.message,
      recoverable: true,
      supportedAlternatives: ["retry reset_classroom"],
    });
  }
  return error instanceof Error ? error : new Error("The classroom operation failed.");
}

function toClassroomData(snapshot: ClassroomSnapshot) {
  return {
    lesson: {
      id: snapshot.lesson.lesson?.id,
      status: snapshot.lesson.status,
      activeStepId: snapshot.lesson.plan.activeStepId,
      stepCount: snapshot.lesson.progress.totalSteps,
      progress: snapshot.lesson.progress.percentage,
    },
    environment: {
      profileId: snapshot.workspace.profileId,
      runtimeProviderId: snapshot.workspace.runtimeProviderId,
      activeFile: snapshot.workspace.activeFilePath,
      activeSurfaceId: snapshot.workspace.activeSurfaceId,
    },
    evidence: {
      lessonRevision: snapshot.lesson.revision,
      environmentRevision: snapshot.workspace.environmentRevision,
      runtimeRevision: snapshot.workspace.runtime.revision,
      lifecycleResources: snapshot.lifecycle.total,
    },
  };
}

function toResetData(scope: ResetClassroomInput["scope"], snapshot: ClassroomSnapshot) {
  return {
    scope,
    lessonStatus: snapshot.lesson.status,
    workspaceStatus: snapshot.workspace.status,
    resourcesRemaining: snapshot.lifecycle.total,
    evidence: {
      lessonRevision: snapshot.lesson.revision,
      environmentRevision: snapshot.workspace.environmentRevision,
    },
  };
}

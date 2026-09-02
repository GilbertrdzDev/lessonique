import type {
  EnvironmentProfile,
  SurfaceConfiguration,
} from "@/core/platform/contracts";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import type {
  EnvironmentActionResult,
  WorkspaceEnvironmentConfiguration,
  WorkspaceFile,
  WorkspaceState,
} from "@/core/workspace/contracts";
import {
  WorkspaceController,
  WorkspaceValidationError,
} from "@/core/workspace/workspace-controller";
import { CapabilityValidationError, CapabilityValidator } from "./capabilities";
import type {
  ConfigureLearningEnvironmentInput,
  SurfaceConfigurationInput,
  ToolExecutionResult,
} from "./contracts";
import { ToolInvocationError } from "./tool-invocation-service";

export type ConfigureLearningEnvironmentData = {
  profileId: string;
  runtimeProviderId: string;
  languageIds: readonly string[];
  visibleFiles: readonly string[];
  activeFile?: string;
  activeSurfaceId?: string;
  surfaces: readonly SurfaceConfiguration[];
  transition: "instant" | "animated";
  action?: EnvironmentActionResult;
  evidence: {
    environmentRevision: number;
    runtimeRevision: number;
  };
};

type PreparedEnvironmentConfiguration = {
  configuration: WorkspaceEnvironmentConfiguration;
  transition: "instant" | "animated";
  actionAfter?: string;
};

export class ConfigureLearningEnvironmentService {
  readonly #controller: WorkspaceController;
  readonly #registries: ProviderPlatformRegistries;
  readonly #validator: CapabilityValidator;

  constructor(
    controller: WorkspaceController,
    registries: ProviderPlatformRegistries,
    validator = new CapabilityValidator(registries),
  ) {
    this.#controller = controller;
    this.#registries = registries;
    this.#validator = validator;
  }

  validate(input: ConfigureLearningEnvironmentInput): void {
    this.#prepare(input);
  }

  async execute(
    input: ConfigureLearningEnvironmentInput,
  ): Promise<ToolExecutionResult<ConfigureLearningEnvironmentData>> {
    const prepared = this.#prepare(input);
    try {
      await this.#controller.configureEnvironment(prepared.configuration);
    } catch (error) {
      if (error instanceof WorkspaceValidationError) {
        throw new ToolInvocationError({
          code: "invalid_environment_configuration",
          message: error.message,
          recoverable: true,
        });
      }
      throw error;
    }

    let action: EnvironmentActionResult | undefined;
    if (prepared.actionAfter) {
      action = await this.#controller.executeAction(prepared.actionAfter);
      if (!action.accepted) {
        throw new ToolInvocationError({
          code: "environment_action_rejected",
          message: action.message,
          recoverable: true,
        });
      }
    }

    const state = this.#controller.store.getSnapshot();
    return {
      ok: true,
      status: "completed",
      revision: state.environmentRevision,
      data: toConfigurationData(state, prepared.transition, action),
    };
  }

  #prepare(
    input: ConfigureLearningEnvironmentInput,
  ): PreparedEnvironmentConfiguration {
    const current = this.#controller.store.getSnapshot();
    const profileId = input.profileId ?? current.profileId;
    if (!profileId) {
      throw new ToolInvocationError({
        code: "no_active_environment",
        message: "Specify a profile before configuring an idle environment.",
        recoverable: true,
        supportedAlternatives: this.#registries.environmentProfiles
          .list()
          .map(({ id }) => id),
      });
    }
    const profile = this.#validator.requireProfile(profileId);
    const runtimeProviderId = input.runtimeProviderId ?? profile.runtimeProviderId;
    this.#validator.requireRuntime(runtimeProviderId, profile.id);

    const sameProfile = current.profileId === profile.id;
    const languageIds = input.languageIds
      ? [...input.languageIds]
      : sameProfile && current.languageIds.length > 0
        ? [...current.languageIds]
        : [...profile.defaultLanguageIds];
    assertUnique(languageIds, "language", "invalid_environment_configuration");
    languageIds.forEach((languageId) =>
      this.#validator.requireLanguage(languageId, profile.id),
    );

    const files = resolveFiles(current, profile, sameProfile, input.visibleFiles);
    files.forEach((file) => {
      if (!languageIds.includes(file.languageId)) {
        throw new ToolInvocationError({
          code: "invalid_environment_configuration",
          message: `Workspace file "${file.path}" requires selected language "${file.languageId}".`,
          recoverable: true,
          supportedAlternatives: profile.allowedLanguageIds,
        });
      }
    });
    const surfaceConfigurations = resolveSurfaceConfigurations(
      current,
      profile,
      sameProfile,
      input.surfaces,
    );
    applyViewport(
      surfaceConfigurations,
      input.viewport,
      input.activeSurfaceId ?? (sameProfile ? current.activeSurfaceId : undefined),
      profile,
      this.#registries,
    );
    surfaceConfigurations.forEach((surface) =>
      this.#validator.validateSurface(surface, profile.id),
    );

    const preservedActiveFile =
      sameProfile &&
      files.some(
        ({ path, visible }) => path === current.activeFilePath && visible,
      )
        ? current.activeFilePath
        : undefined;
    const activeFilePath = resolveActiveFilePath(
      files,
      input.activeFile ?? preservedActiveFile,
    );
    const preservedActiveSurface =
      sameProfile &&
      surfaceConfigurations.some(
        ({ id, visible }) => id === current.activeSurfaceId && visible !== false,
      )
        ? current.activeSurfaceId
        : undefined;
    const activeSurfaceId = resolveActiveSurfaceId(
      surfaceConfigurations,
      input.activeSurfaceId ?? preservedActiveSurface,
    );
    if (input.actionAfter) {
      this.#validator.validateAction(input.actionAfter, {}, profile.id);
    }

    return {
      configuration: {
        profileId: profile.id,
        runtimeProviderId,
        languageIds,
        files,
        surfaces: surfaceConfigurations,
        ...(activeFilePath ? { activeFilePath } : {}),
        ...(activeSurfaceId ? { activeSurfaceId } : {}),
        focusActiveSurface: input.activeSurfaceId !== undefined,
        clearConsole: input.clearConsole ?? false,
      },
      transition: input.transition ?? "instant",
      ...(input.actionAfter ? { actionAfter: input.actionAfter } : {}),
    };
  }
}

function resolveFiles(
  current: WorkspaceState,
  profile: EnvironmentProfile,
  sameProfile: boolean,
  visibleFiles: readonly string[] | undefined,
): WorkspaceFile[] {
  const files =
    sameProfile && current.files.length > 0
      ? current.files.map((file) => ({ ...file }))
      : profile.defaultFiles.map((file) => ({
          ...file,
          visible: file.visible ?? true,
        }));
  if (!visibleFiles) return files;

  assertUnique(visibleFiles, "visible file", "invalid_environment_configuration");
  const requested = new Set(visibleFiles);
  visibleFiles.forEach((path) => {
    if (!files.some((file) => file.path === path)) {
      throw new ToolInvocationError({
        code: "invalid_environment_configuration",
        message: `Visible file "${path}" is not in the target workspace.`,
        recoverable: true,
        supportedAlternatives: files.map(({ path: candidate }) => candidate),
      });
    }
  });
  return files.map((file) => ({ ...file, visible: requested.has(file.path) }));
}

function resolveSurfaceConfigurations(
  current: WorkspaceState,
  profile: EnvironmentProfile,
  sameProfile: boolean,
  requested: readonly SurfaceConfigurationInput[] | undefined,
): SurfaceConfigurationInput[] {
  const base =
    sameProfile && current.surfaces.length > 0
      ? current.surfaces.map(toSurfaceConfiguration)
      : profile.defaultSurfaces.map(cloneSurfaceConfiguration);
  if (!requested) return base;

  assertUnique(
    requested.map(({ id }) => id),
    "surface",
    "invalid_environment_configuration",
  );
  requested.forEach((patch) => {
    const index = base.findIndex(({ id }) => id === patch.id);
    const previous = index >= 0 ? base[index] : undefined;
    const next = mergeSurfaceConfiguration(previous, patch);
    if (index >= 0) {
      base[index] = next;
    } else {
      base.push(next);
    }
  });
  return base;
}

function mergeSurfaceConfiguration(
  previous: SurfaceConfigurationInput | undefined,
  patch: SurfaceConfigurationInput,
): SurfaceConfigurationInput {
  const previousOptions = new Map(
    (previous?.options ?? []).map((option) => [option.optionId, { ...option }]),
  );
  patch.options?.forEach((option) =>
    previousOptions.set(option.optionId, { ...option }),
  );
  return {
    ...(previous ?? { id: patch.id }),
    ...patch,
    options: [...previousOptions.values()],
  };
}

function applyViewport(
  surfaces: SurfaceConfigurationInput[],
  viewport: string | undefined,
  preferredSurfaceId: string | undefined,
  profile: EnvironmentProfile,
  registries: ProviderPlatformRegistries,
): void {
  if (!viewport) return;
  const candidates = surfaces.filter(({ id }) => {
    const definition = registries.surfaces.get(id);
    return definition?.supportedModeIds.includes(viewport) === true;
  });
  const preferred = candidates.find(({ id }) => id === preferredSurfaceId);
  const selected = preferred ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (!selected) {
    const alternatives = profile.allowedSurfaceIds.flatMap(
      (surfaceId) => registries.surfaces.get(surfaceId)?.supportedModeIds ?? [],
    );
    throw new CapabilityValidationError({
      category: "surface_mode",
      requestedId: viewport,
      message:
        candidates.length > 1
          ? `Viewport "${viewport}" matches multiple surfaces; specify activeSurfaceId.`
          : `Viewport "${viewport}" is not supported by the target profile.`,
      supportedAlternatives: [...new Set(alternatives)],
    });
  }
  selected.modeId = viewport;
}

function resolveActiveFilePath(
  files: readonly WorkspaceFile[],
  requestedPath: string | undefined,
): string | undefined {
  if (requestedPath) {
    const requested = files.find(({ path }) => path === requestedPath);
    if (!requested?.visible) {
      throw new ToolInvocationError({
        code: "invalid_environment_configuration",
        message: `Active file "${requestedPath}" must be visible.`,
        recoverable: true,
        supportedAlternatives: files.filter(({ visible }) => visible).map(({ path }) => path),
      });
    }
    return requested.path;
  }
  return files.find(({ visible }) => visible)?.path;
}

function resolveActiveSurfaceId(
  surfaces: readonly SurfaceConfigurationInput[],
  requestedId: string | undefined,
): string | undefined {
  if (requestedId) {
    const requested = surfaces.find(({ id }) => id === requestedId);
    if (!requested || requested.visible === false) {
      throw new ToolInvocationError({
        code: "invalid_environment_configuration",
        message: `Active surface "${requestedId}" must be configured and visible.`,
        recoverable: true,
        supportedAlternatives: surfaces
          .filter(({ visible }) => visible !== false)
          .map(({ id }) => id),
      });
    }
    return requested.id;
  }
  return surfaces.find(({ visible }) => visible !== false)?.id;
}

function assertUnique(
  values: readonly string[],
  label: string,
  code: string,
): void {
  const seen = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) {
      throw new ToolInvocationError({
        code,
        message: `The ${label} "${value}" is specified more than once.`,
        recoverable: true,
      });
    }
    seen.add(value);
  });
}

function toSurfaceConfiguration(
  surface: WorkspaceState["surfaces"][number],
): SurfaceConfigurationInput {
  return {
    id: surface.id,
    visible: surface.visible,
    order: surface.order,
    ...(surface.placementId ? { placementId: surface.placementId } : {}),
    ...(surface.modeId ? { modeId: surface.modeId } : {}),
    ...(surface.size !== undefined ? { size: surface.size } : {}),
    options: Object.entries(surface.options).map(([optionId, value]) => ({
      optionId,
      value,
    })),
  };
}

function cloneSurfaceConfiguration(
  surface: SurfaceConfiguration,
): SurfaceConfigurationInput {
  return {
    ...surface,
    options: surface.options?.map((option) => ({ ...option })),
  };
}

function toConfigurationData(
  state: WorkspaceState,
  transition: "instant" | "animated",
  action: EnvironmentActionResult | undefined,
): ConfigureLearningEnvironmentData {
  if (!state.profileId || !state.runtimeProviderId) {
    throw new Error("The configured workspace did not expose its active providers.");
  }
  return {
    profileId: state.profileId,
    runtimeProviderId: state.runtimeProviderId,
    languageIds: [...state.languageIds],
    visibleFiles: state.files.filter(({ visible }) => visible).map(({ path }) => path),
    ...(state.activeFilePath ? { activeFile: state.activeFilePath } : {}),
    ...(state.activeSurfaceId ? { activeSurfaceId: state.activeSurfaceId } : {}),
    surfaces: state.surfaces.map(toSurfaceConfiguration),
    transition,
    ...(action ? { action } : {}),
    evidence: {
      environmentRevision: state.environmentRevision,
      runtimeRevision: state.runtime.revision,
    },
  };
}

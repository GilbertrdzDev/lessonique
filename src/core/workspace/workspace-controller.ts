import {
  DEFAULT_SYSTEM_LIMITS,
  type EnvironmentProfile,
  type InteractionEvent,
  type SurfaceConfiguration,
  type SurfaceOptionValue,
  type SystemLimits,
} from "@/core/platform/contracts";
import type {
  EnvironmentActionId,
  EnvironmentProfileId,
  SurfaceId,
} from "@/core/platform/identifiers";
import { validateClosedJsonObjectInput } from "@/core/platform/json-schema";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";

import {
  createIdleWorkspaceState,
  type ConsoleEntry,
  type EnvironmentActionResult,
  type SurfaceState,
  type WorkspaceFile,
  type WorkspaceEnvironmentConfiguration,
  type WorkspaceFileOperation,
  type WorkspaceState,
} from "./contracts";
import type {
  RuntimeAdapter,
  RuntimeAdapterResolver,
} from "./runtime-adapter";
import type { SurfaceAdapterRegistry } from "./surface-adapter";
import { WorkspaceStore } from "./store";

export class WorkspaceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceValidationError";
  }
}

export interface WorkspaceControllerDependencies {
  store: WorkspaceStore;
  registries: ProviderPlatformRegistries;
  surfaceAdapters: SurfaceAdapterRegistry;
  runtimeAdapters: RuntimeAdapterResolver;
  baseLimits?: Readonly<SystemLimits>;
}

export class WorkspaceController {
  readonly #store: WorkspaceStore;
  readonly #registries: ProviderPlatformRegistries;
  readonly #surfaceAdapters: SurfaceAdapterRegistry;
  readonly #runtimeAdapters: RuntimeAdapterResolver;
  readonly #baseLimits: Readonly<SystemLimits>;
  #runtime?: RuntimeAdapter;

  constructor(dependencies: WorkspaceControllerDependencies) {
    this.#store = dependencies.store;
    this.#registries = dependencies.registries;
    this.#surfaceAdapters = dependencies.surfaceAdapters;
    this.#runtimeAdapters = dependencies.runtimeAdapters;
    this.#baseLimits = dependencies.baseLimits ?? DEFAULT_SYSTEM_LIMITS;
  }

  get store(): WorkspaceStore {
    return this.#store;
  }

  get runtime(): RuntimeAdapter | undefined {
    return this.#runtime;
  }

  validateEnvironmentConfiguration(
    configuration: WorkspaceEnvironmentConfiguration,
  ): void {
    const profile = this.#registries.environmentProfiles.require(
      configuration.profileId,
    );
    if (profile.runtimeProviderId !== configuration.runtimeProviderId) {
      throw new WorkspaceValidationError(
        `Runtime "${configuration.runtimeProviderId}" is not supported by profile "${profile.id}".`,
      );
    }
    this.#validateLanguageSelection(profile, configuration.languageIds);
    this.#validateFiles(profile, configuration.files);
    configuration.files.forEach((file) => {
      if (!configuration.languageIds.includes(file.languageId)) {
        throw new WorkspaceValidationError(
          `Workspace file "${file.path}" requires selected language "${file.languageId}".`,
        );
      }
    });
    const surfaces = this.#resolveSurfaces(profile, configuration.surfaces);
    this.#resolveActiveFile(configuration.files, configuration.activeFilePath);
    this.#resolveActiveSurface(surfaces, configuration.activeSurfaceId);
    this.#runtimeAdapters.get(configuration.runtimeProviderId);
  }

  async activateProfile(profileId: EnvironmentProfileId): Promise<void> {
    const profile = this.#registries.environmentProfiles.require(profileId);
    await this.configureEnvironment({
      profileId: profile.id,
      runtimeProviderId: profile.runtimeProviderId,
      languageIds: [...profile.defaultLanguageIds],
      files: profile.defaultFiles.map((file) => ({
        ...file,
        visible: file.visible ?? true,
      })),
      surfaces: profile.defaultSurfaces,
      activeSurfaceId: profile.defaultSurfaces.find(
        ({ visible }) => visible !== false,
      )?.id,
      activeFilePath: profile.defaultFiles.find(
        ({ visible }) => visible !== false,
      )?.path,
      clearConsole: true,
    });
  }

  async configureEnvironment(
    configuration: WorkspaceEnvironmentConfiguration,
  ): Promise<void> {
    const previousState = this.#store.getSnapshot();
    const previousRuntime = this.#runtime;
    const profile = this.#registries.environmentProfiles.require(
      configuration.profileId,
    );
    if (profile.runtimeProviderId !== configuration.runtimeProviderId) {
      throw new WorkspaceValidationError(
        `Runtime "${configuration.runtimeProviderId}" is not supported by profile "${profile.id}".`,
      );
    }
    this.#validateLanguageSelection(profile, configuration.languageIds);
    this.#validateFiles(profile, configuration.files);
    configuration.files.forEach((file) => {
      if (!configuration.languageIds.includes(file.languageId)) {
        throw new WorkspaceValidationError(
          `Workspace file "${file.path}" requires selected language "${file.languageId}".`,
        );
      }
    });
    const surfaces = this.#resolveSurfaces(profile, configuration.surfaces);
    const activeFilePath = this.#resolveActiveFile(
      configuration.files,
      configuration.activeFilePath,
    );
    const activeSurfaceId = this.#resolveActiveSurface(
      surfaces,
      configuration.activeSurfaceId,
    );
    const nextRuntime = this.#runtimeAdapters.get(configuration.runtimeProviderId);
    const filesChanged =
      nextRuntime !== previousRuntime ||
      !workspaceFilesEqual(previousState.files, configuration.files);

    if (filesChanged) {
      await nextRuntime.replaceFiles(configuration.files);
    }
    try {
      await this.#applySurfaceTransaction(surfaces, previousState.surfaces);
    } catch (error) {
      if (filesChanged && nextRuntime === previousRuntime) {
        await nextRuntime.replaceFiles(previousState.files);
      } else if (nextRuntime !== previousRuntime) {
        await nextRuntime.dispose();
      }
      throw error;
    }

    const profileChanged = previousState.profileId !== profile.id;
    const runtimeSnapshot = nextRuntime.getSnapshot();
    this.#runtime = nextRuntime;
    this.#store.commit({
      status: "ready",
      profileId: profile.id,
      runtimeProviderId: nextRuntime.providerId,
      languageIds: [...configuration.languageIds],
      files: configuration.files.map((file) => ({ ...file })),
      surfaces,
      ...(activeSurfaceId ? { activeSurfaceId } : {}),
      ...(activeFilePath ? { activeFilePath } : {}),
      consoleEntries:
        configuration.clearConsole || profileChanged
          ? []
          : previousState.consoleEntries.map((entry) => ({ ...entry })),
      interactionEvents: profileChanged
        ? []
        : previousState.interactionEvents.map((event) => ({ ...event })),
      runtime: {
        providerId: runtimeSnapshot.providerId,
        status: runtimeSnapshot.status,
        revision: runtimeSnapshot.revision,
        ...(runtimeSnapshot.errorMessage
          ? { errorMessage: runtimeSnapshot.errorMessage }
          : {}),
      },
      environmentRevision: previousState.environmentRevision + 1,
    });

    if (activeSurfaceId && configuration.focusActiveSurface) {
      this.#surfaceAdapters.require(activeSurfaceId).activate?.();
    }

    if (previousRuntime && previousRuntime !== nextRuntime) {
      await previousRuntime.dispose();
    }
  }

  async replaceFiles(files: readonly WorkspaceFile[]): Promise<void> {
    const { profile, runtime } = this.#requireActiveEnvironment();
    this.#validateFiles(profile, files);
    await runtime.replaceFiles(files);
    this.#commitFiles(files);
  }

  async applyFileOperations(
    operations: readonly WorkspaceFileOperation[],
  ): Promise<void> {
    const { profile, runtime } = this.#requireActiveEnvironment();
    const nextFiles = applyOperations(this.#store.getSnapshot().files, operations);
    this.#validateFiles(profile, nextFiles);
    await runtime.applyOperations(operations);
    this.#commitFiles(nextFiles);
  }

  async updateFileContent(path: string, content: string): Promise<void> {
    await this.applyFileOperations([{ type: "update", path, content }]);
  }

  async openFile(path: string): Promise<void> {
    const state = this.#store.getSnapshot();
    const file = state.files.find((candidate) => candidate.path === path);
    if (!file || !file.visible) {
      throw new WorkspaceValidationError(
        `Workspace file "${path}" is not available as a visible tab.`,
      );
    }
    if (state.activeFilePath === path) {
      return;
    }
    this.#store.commit({
      ...state,
      activeFilePath: path,
      environmentRevision: state.environmentRevision + 1,
    });
  }

  async configureSurfaces(
    configurations: readonly SurfaceConfiguration[],
  ): Promise<void> {
    const state = this.#store.getSnapshot();
    const profile = this.#requireProfile(state);
    const nextSurfaces = this.#resolveSurfaces(profile, configurations);
    await this.#applySurfaceTransaction(nextSurfaces, state.surfaces);
    this.#store.commit({
      ...state,
      surfaces: nextSurfaces,
      activeSurfaceId:
        state.activeSurfaceId &&
        nextSurfaces.some(
          ({ id, visible }) => id === state.activeSurfaceId && visible,
        )
          ? state.activeSurfaceId
          : nextSurfaces.find(({ visible }) => visible)?.id,
      environmentRevision: state.environmentRevision + 1,
    });
  }

  async executeAction(
    actionId: EnvironmentActionId,
    input: unknown = {},
  ): Promise<EnvironmentActionResult> {
    const state = this.#store.getSnapshot();
    const profile = this.#requireProfile(state);
    if (!profile.allowedActionIds.includes(actionId)) {
      throw new WorkspaceValidationError(
        `Action "${actionId}" is not allowed by profile "${profile.id}".`,
      );
    }
    const action = this.#registries.actions.require(actionId);
    validateClosedJsonObjectInput(
      action.inputSchema,
      input,
      `Environment action "${actionId}" input`,
    );

    const result =
      action.ownerType === "surface"
        ? await this.#surfaceAdapters
            .require(action.ownerId)
            .executeAction(actionId, input)
        : await this.#requireActiveEnvironment().runtime.executeAction(
            actionId,
            input,
          );
    this.#syncRuntimeState();
    return result;
  }

  replaceConsoleEntries(entries: readonly ConsoleEntry[]): void {
    const state = this.#store.getSnapshot();
    const limits = this.#getLimits(this.#requireProfile(state));
    const nextEntries = entries.slice(-limits.maxActivityEvents).map((entry) => {
      const previous = state.consoleEntries.find(
        (candidate) =>
          candidate.id === entry.id &&
          candidate.kind === entry.kind &&
          candidate.message === entry.message,
      );
      return previous ? { ...previous } : { ...entry };
    });
    if (consoleEntriesEqual(state.consoleEntries, nextEntries)) {
      return;
    }
    this.#store.commit({
      ...state,
      consoleEntries: nextEntries,
    });
  }

  recordInteraction(event: InteractionEvent): void {
    const state = this.#store.getSnapshot();
    const limits = this.#getLimits(this.#requireProfile(state));
    this.#store.commit({
      ...state,
      interactionEvents: [...state.interactionEvents, event].slice(
        -limits.maxActivityEvents,
      ),
    });
  }

  async restore(state: WorkspaceState): Promise<void> {
    if (!state.profileId) {
      throw new WorkspaceValidationError(
        "A persisted workspace must include a profile ID.",
      );
    }
    const profile = this.#registries.environmentProfiles.require(state.profileId);
    if (state.runtimeProviderId !== profile.runtimeProviderId) {
      throw new WorkspaceValidationError(
        "The persisted runtime does not match its environment profile.",
      );
    }
    this.#validateFiles(profile, state.files);
    const surfaces = this.#resolveSurfaces(
      profile,
      state.surfaces.map(toSurfaceConfiguration),
    );
    const nextRuntime = this.#runtimeAdapters.get(profile.runtimeProviderId);
    await nextRuntime.replaceFiles(state.files);
    await this.#applySurfaceTransaction(
      surfaces,
      this.#store.getSnapshot().surfaces,
    );
    this.#runtime = nextRuntime;
    this.#store.commit({
      ...state,
      status: "ready",
      languageIds: [...state.languageIds],
      files: state.files.map((file) => ({ ...file })),
      surfaces,
      consoleEntries: state.consoleEntries.map((entry) => ({ ...entry })),
      interactionEvents: state.interactionEvents.map((event) => ({ ...event })),
      runtime: {
        providerId: nextRuntime.providerId,
        status: nextRuntime.getSnapshot().status,
        revision: nextRuntime.getSnapshot().revision,
      },
      environmentRevision: Math.max(1, state.environmentRevision),
    });
  }

  async resetRuntime(): Promise<void> {
    const state = this.#store.getSnapshot();
    if (!state.runtimeProviderId && state.runtime.status === "idle") {
      return;
    }
    await this.#runtime?.reset?.();
    const runtimeSnapshot = this.#runtime?.getSnapshot();
    this.#store.commit({
      ...state,
      status: state.profileId ? "stopped" : "idle",
      consoleEntries: [],
      runtime: runtimeSnapshot
        ? {
            providerId: runtimeSnapshot.providerId,
            status: "stopped",
            revision: runtimeSnapshot.revision,
          }
        : {
            status: "idle",
            revision: state.runtime.revision + 1,
          },
      environmentRevision: state.environmentRevision + 1,
    });
  }

  async clearEnvironment(): Promise<void> {
    const state = this.#store.getSnapshot();
    if (
      state.status === "idle" &&
      !state.profileId &&
      state.files.length === 0 &&
      state.surfaces.length === 0
    ) {
      return;
    }
    if (this.#runtime) {
      await this.#runtime.replaceFiles([]);
      await this.#runtime.reset?.();
    }
    this.#store.commit({
      ...createIdleWorkspaceState(),
      environmentRevision: state.environmentRevision + 1,
    });
  }

  async dispose(): Promise<void> {
    await this.#runtime?.dispose();
    this.#runtime = undefined;
  }

  #resolveSurfaces(
    profile: EnvironmentProfile,
    configurations: readonly SurfaceConfiguration[],
  ): SurfaceState[] {
    const seen = new Set<SurfaceId>();
    return configurations
      .map((configuration, index) => {
        if (seen.has(configuration.id)) {
          throw new WorkspaceValidationError(
            `Surface "${configuration.id}" is configured more than once.`,
          );
        }
        seen.add(configuration.id);
        if (!profile.allowedSurfaceIds.includes(configuration.id)) {
          throw new WorkspaceValidationError(
            `Surface "${configuration.id}" is not allowed by profile "${profile.id}".`,
          );
        }
        const definition = this.#registries.surfaces.require(configuration.id);
        const modeId = configuration.modeId ?? definition.supportedModeIds[0];
        const placementId =
          configuration.placementId ?? definition.supportedPlacementIds[0];
        if (modeId && !definition.supportedModeIds.includes(modeId)) {
          throw new WorkspaceValidationError(
            `Mode "${modeId}" is not supported by surface "${configuration.id}".`,
          );
        }
        if (
          placementId &&
          !definition.supportedPlacementIds.includes(placementId)
        ) {
          throw new WorkspaceValidationError(
            `Placement "${placementId}" is not supported by surface "${configuration.id}".`,
          );
        }
        if (
          configuration.size !== undefined &&
          (!Number.isFinite(configuration.size) || configuration.size <= 0)
        ) {
          throw new WorkspaceValidationError(
            `Surface "${configuration.id}" has an invalid size.`,
          );
        }
        const options = this.#resolveSurfaceOptions(
          configuration.id,
          configuration.options ?? [],
        );
        return {
          id: configuration.id,
          visible: configuration.visible ?? true,
          order: configuration.order ?? index,
          ...(placementId ? { placementId } : {}),
          ...(modeId ? { modeId } : {}),
          ...(configuration.size !== undefined
            ? { size: configuration.size }
            : {}),
          options,
        };
      })
      .sort((left, right) => left.order - right.order);
  }

  #resolveSurfaceOptions(
    surfaceId: SurfaceId,
    options: NonNullable<SurfaceConfiguration["options"]>,
  ): Record<string, SurfaceOptionValue> {
    const definition = this.#registries.surfaces.require(surfaceId);
    const result: Record<string, SurfaceOptionValue> = {};
    definition.configurationOptions.forEach((option) => {
      if (option.defaultValue !== undefined) {
        result[option.id] = option.defaultValue;
      }
    });
    const seen = new Set<string>();
    options.forEach(({ optionId, value }) => {
      if (seen.has(optionId)) {
        throw new WorkspaceValidationError(
          `Surface option "${optionId}" is configured more than once.`,
        );
      }
      seen.add(optionId);
      const option = definition.configurationOptions.find(
        ({ id }) => id === optionId,
      );
      if (!option) {
        throw new WorkspaceValidationError(
          `Surface "${surfaceId}" does not declare option "${optionId}".`,
        );
      }
      if (typeof value !== option.valueType) {
        throw new WorkspaceValidationError(
          `Surface option "${optionId}" requires a ${option.valueType} value.`,
        );
      }
      if (
        option.allowedValues &&
        !option.allowedValues.includes(value)
      ) {
        throw new WorkspaceValidationError(
          `Surface option "${optionId}" does not allow value "${String(value)}".`,
        );
      }
      if (
        typeof value === "number" &&
        ((option.minimum !== undefined && value < option.minimum) ||
          (option.maximum !== undefined && value > option.maximum))
      ) {
        throw new WorkspaceValidationError(
          `Surface option "${optionId}" is outside its allowed range.`,
        );
      }
      result[optionId] = value;
    });
    return result;
  }

  #validateFiles(
    profile: EnvironmentProfile,
    files: readonly WorkspaceFile[],
  ): void {
    const limits = this.#getLimits(profile);
    if (files.length > limits.maxFiles) {
      throw new WorkspaceValidationError(
        `The workspace exceeds the limit of ${limits.maxFiles} files.`,
      );
    }
    const seenPaths = new Set<string>();
    files.forEach((file) => {
      validateWorkspacePath(file.path);
      if (seenPaths.has(file.path)) {
        throw new WorkspaceValidationError(
          `Workspace file path "${file.path}" is duplicated.`,
        );
      }
      seenPaths.add(file.path);
      if (!profile.allowedLanguageIds.includes(file.languageId)) {
        throw new WorkspaceValidationError(
          `Language "${file.languageId}" is not allowed by profile "${profile.id}".`,
        );
      }
      const language = this.#registries.languages.require(file.languageId);
      if (!language.extensions.some((extension) => file.path.endsWith(extension))) {
        throw new WorkspaceValidationError(
          `Workspace file "${file.path}" does not match language "${file.languageId}".`,
        );
      }
      if (new TextEncoder().encode(file.content).byteLength > limits.maxFileBytes) {
        throw new WorkspaceValidationError(
          `Workspace file "${file.path}" exceeds the ${limits.maxFileBytes}-byte limit.`,
        );
      }
    });
  }

  #validateLanguageSelection(
    profile: EnvironmentProfile,
    languageIds: readonly string[],
  ): void {
    if (languageIds.length === 0) {
      throw new WorkspaceValidationError(
        `Profile "${profile.id}" requires at least one selected language.`,
      );
    }
    const seen = new Set<string>();
    languageIds.forEach((languageId) => {
      if (seen.has(languageId)) {
        throw new WorkspaceValidationError(
          `Language "${languageId}" is selected more than once.`,
        );
      }
      seen.add(languageId);
      if (!profile.allowedLanguageIds.includes(languageId)) {
        throw new WorkspaceValidationError(
          `Language "${languageId}" is not allowed by profile "${profile.id}".`,
        );
      }
      this.#registries.languages.require(languageId);
    });
  }

  #resolveActiveFile(
    files: readonly WorkspaceFile[],
    requestedPath: string | undefined,
  ): string | undefined {
    if (requestedPath !== undefined) {
      const requested = files.find(({ path }) => path === requestedPath);
      if (!requested || !requested.visible) {
        throw new WorkspaceValidationError(
          `Active file "${requestedPath}" must be a visible workspace file.`,
        );
      }
      return requested.path;
    }
    return files.find(({ visible }) => visible)?.path;
  }

  #resolveActiveSurface(
    surfaces: readonly SurfaceState[],
    requestedId: SurfaceId | undefined,
  ): SurfaceId | undefined {
    if (requestedId !== undefined) {
      const requested = surfaces.find(({ id }) => id === requestedId);
      if (!requested || !requested.visible) {
        throw new WorkspaceValidationError(
          `Active surface "${requestedId}" must be configured and visible.`,
        );
      }
      return requested.id;
    }
    return surfaces.find(({ visible }) => visible)?.id;
  }

  async #applySurfaceTransaction(
    nextSurfaces: readonly SurfaceState[],
    previousSurfaces: readonly SurfaceState[],
  ): Promise<void> {
    const attempted: SurfaceState[] = [];
    try {
      for (const surface of nextSurfaces) {
        attempted.push(surface);
        await this.#surfaceAdapters.require(surface.id).configure(surface);
      }
    } catch (error) {
      for (const surface of attempted.toReversed()) {
        const previous = previousSurfaces.find(({ id }) => id === surface.id);
        if (previous) {
          await this.#surfaceAdapters.require(surface.id).configure(previous);
        }
      }
      throw error;
    }
  }

  #commitFiles(files: readonly WorkspaceFile[]): void {
    const state = this.#store.getSnapshot();
    const runtimeSnapshot = this.#runtime?.getSnapshot();
    const activeFilePath = files.some(
      ({ path, visible }) => path === state.activeFilePath && visible,
    )
      ? state.activeFilePath
      : files.find(({ visible }) => visible)?.path;
    this.#store.commit({
      ...state,
      files: files.map((file) => ({ ...file })),
      activeFilePath,
      runtime: runtimeSnapshot
        ? {
            providerId: runtimeSnapshot.providerId,
            status: runtimeSnapshot.status,
            revision: runtimeSnapshot.revision,
            ...(runtimeSnapshot.errorMessage
              ? { errorMessage: runtimeSnapshot.errorMessage }
              : {}),
          }
        : state.runtime,
      environmentRevision: state.environmentRevision + 1,
    });
  }

  #syncRuntimeState(): void {
    if (!this.#runtime) {
      return;
    }
    const state = this.#store.getSnapshot();
    const snapshot = this.#runtime.getSnapshot();
    this.#store.commit({
      ...state,
      status: snapshot.status === "error" ? "error" : state.status,
      runtime: {
        providerId: snapshot.providerId,
        status: snapshot.status,
        revision: snapshot.revision,
        ...(snapshot.errorMessage
          ? { errorMessage: snapshot.errorMessage }
          : {}),
      },
    });
  }

  #requireActiveEnvironment(): {
    profile: EnvironmentProfile;
    runtime: RuntimeAdapter;
  } {
    const profile = this.#requireProfile(this.#store.getSnapshot());
    if (!this.#runtime) {
      throw new WorkspaceValidationError("The workspace runtime is not active.");
    }
    return { profile, runtime: this.#runtime };
  }

  #requireProfile(state: WorkspaceState): EnvironmentProfile {
    if (!state.profileId) {
      throw new WorkspaceValidationError(
        "The workspace does not have an active environment profile.",
      );
    }
    return this.#registries.environmentProfiles.require(state.profileId);
  }

  #getLimits(profile: EnvironmentProfile): SystemLimits {
    return { ...this.#baseLimits, ...profile.limits };
  }
}

function applyOperations(
  currentFiles: readonly WorkspaceFile[],
  operations: readonly WorkspaceFileOperation[],
): WorkspaceFile[] {
  const files = currentFiles.map((file) => ({ ...file }));
  operations.forEach((operation) => {
    const index = files.findIndex(({ path }) =>
      operation.type === "create"
        ? path === operation.file.path
        : path === operation.path,
    );
    if (operation.type === "create") {
      if (index >= 0) {
        throw new WorkspaceValidationError(
          `Workspace file "${operation.file.path}" already exists.`,
        );
      }
      files.push({ ...operation.file });
      return;
    }
    if (index < 0) {
      throw new WorkspaceValidationError(
        `Workspace file "${operation.path}" does not exist.`,
      );
    }
    if (operation.type === "delete") {
      files.splice(index, 1);
      return;
    }
    const current = files[index];
    if (!current) {
      return;
    }
    if (current.readOnly) {
      throw new WorkspaceValidationError(
        `Workspace file "${operation.path}" is read-only.`,
      );
    }
    files[index] = { ...current, content: operation.content };
  });
  return files;
}

function validateWorkspacePath(path: string): void {
  const segments = path.split("/");
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /^[a-z]:/iu.test(path) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new WorkspaceValidationError(
      `Workspace path "${path}" must remain inside the workspace.`,
    );
  }
}

function toSurfaceConfiguration(surface: SurfaceState): SurfaceConfiguration {
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

function consoleEntriesEqual(
  left: readonly ConsoleEntry[],
  right: readonly ConsoleEntry[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) =>
        entry.id === right[index]?.id &&
        entry.kind === right[index]?.kind &&
        entry.message === right[index]?.message &&
        entry.occurredAt === right[index]?.occurredAt,
    )
  );
}

function workspaceFilesEqual(
  left: readonly WorkspaceFile[],
  right: readonly WorkspaceFile[],
): boolean {
  return (
    left.length === right.length &&
    left.every((file, index) => {
      const candidate = right[index];
      return (
        file.path === candidate?.path &&
        file.languageId === candidate.languageId &&
        file.content === candidate.content &&
        file.visible === candidate.visible &&
        file.readOnly === candidate.readOnly
      );
    })
  );
}

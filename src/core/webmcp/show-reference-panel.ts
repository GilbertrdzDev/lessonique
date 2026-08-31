import type { ClassroomLifecycleService } from "@/core/lesson";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import {
  ReferencePanelStore,
  type ReferencePanel,
} from "@/core/reference";
import type { WorkspaceController } from "@/core/workspace";

import { CapabilityValidator } from "./capabilities";
import { ConfigureLearningEnvironmentService } from "./configure-learning-environment";
import type {
  ShowReferencePanelInput,
  ToolExecutionResult,
} from "./contracts";
import { ToolInvocationError } from "./tool-invocation-service";

export type ShowReferencePanelData = ReturnType<typeof toReferenceData>;

type PreparedReference = Readonly<{
  reference: ReferencePanel;
  shouldConfigureSurface: boolean;
  focus: boolean;
  replaced: boolean;
}>;

export class ShowReferencePanelService {
  readonly #workspace: WorkspaceController;
  readonly #registries: ProviderPlatformRegistries;
  readonly #references: ReferencePanelStore;
  readonly #lifecycle: ClassroomLifecycleService;
  readonly #configuration: ConfigureLearningEnvironmentService;
  readonly #capabilities: CapabilityValidator;
  readonly #compatibleModeId: string;
  #releaseLifecycle?: () => void;

  constructor(dependencies: {
    workspace: WorkspaceController;
    registries: ProviderPlatformRegistries;
    references: ReferencePanelStore;
    lifecycle: ClassroomLifecycleService;
    compatibleModeId: string;
  }) {
    this.#workspace = dependencies.workspace;
    this.#registries = dependencies.registries;
    this.#references = dependencies.references;
    this.#lifecycle = dependencies.lifecycle;
    this.#compatibleModeId = dependencies.compatibleModeId;
    this.#configuration = new ConfigureLearningEnvironmentService(
      dependencies.workspace,
      dependencies.registries,
    );
    this.#capabilities = new CapabilityValidator(dependencies.registries);
  }

  validate(input: ShowReferencePanelInput): void {
    this.#prepare(input);
  }

  async execute(
    input: ShowReferencePanelInput,
  ): Promise<ToolExecutionResult<ShowReferencePanelData>> {
    const prepared = this.#prepare(input);
    if (prepared.shouldConfigureSurface) {
      await this.#configuration.execute({
        surfaces: [{ id: prepared.reference.surfaceId, visible: true }],
        ...(prepared.focus
          ? { activeSurfaceId: prepared.reference.surfaceId }
          : {}),
      });
    }
    const beforeRevision = this.#references.getSnapshot().revision;
    const snapshot = this.#references.show(prepared.reference);
    this.#ensureLifecycleRegistration();
    const workspace = this.#workspace.store.getSnapshot();
    return {
      ok: true,
      status: "completed",
      revision: snapshot.revision,
      data: toReferenceData(
        snapshot.active!,
        prepared.replaced,
        snapshot.revision === beforeRevision,
        workspace.environmentRevision,
        prepared.focus && workspace.activeSurfaceId === prepared.reference.surfaceId,
      ),
    };
  }

  #prepare(input: ShowReferencePanelInput): PreparedReference {
    const workspace = this.#workspace.store.getSnapshot();
    if (!workspace.profileId) {
      throw new ToolInvocationError({
        code: "no_active_environment",
        message: "Create or configure an environment before showing a reference.",
        recoverable: true,
        supportedAlternatives: [
          "create_guided_lesson",
          "configure_learning_environment",
        ],
      });
    }
    const profile = this.#capabilities.requireProfile(workspace.profileId);
    const compatibleSurfaceIds = profile.allowedSurfaceIds.filter(
      (surfaceId) =>
        this.#registries.surfaces
          .require(surfaceId)
          .supportedModeIds.includes(this.#compatibleModeId),
    );
    const surfaceId = input.surfaceId ?? compatibleSurfaceIds[0];
    if (!surfaceId || !compatibleSurfaceIds.includes(surfaceId)) {
      throw new ToolInvocationError({
        code: "unsupported_reference_surface",
        message: surfaceId
          ? `Surface "${surfaceId}" cannot present structured references.`
          : `Profile "${profile.id}" has no compatible reference surface.`,
        recoverable: true,
        supportedAlternatives: compatibleSurfaceIds,
      });
    }
    input.snippets?.forEach(({ languageId }) =>
      this.#capabilities.requireLanguage(languageId, profile.id),
    );
    const surface = workspace.surfaces.find(({ id }) => id === surfaceId);
    const focus = input.focus ?? false;
    const shouldConfigureSurface =
      surface?.visible !== true ||
      (focus && workspace.activeSurfaceId !== surfaceId);
    if (shouldConfigureSurface) {
      this.#configuration.validate({
        surfaces: [{ id: surfaceId, visible: true }],
        ...(focus ? { activeSurfaceId: surfaceId } : {}),
      });
    }
    const previous = this.#references.getSnapshot().active;
    return {
      reference: {
        referenceId: input.referenceId,
        title: input.title,
        content: input.content,
        snippets: (input.snippets ?? []).map((snippet) => ({ ...snippet })),
        surfaceId,
      },
      shouldConfigureSurface,
      focus,
      replaced: previous?.referenceId === input.referenceId,
    };
  }

  #ensureLifecycleRegistration(): void {
    if (this.#releaseLifecycle) return;
    this.#releaseLifecycle = this.#lifecycle.register({
      id: "reference-panel",
      kind: "visual-guide",
      dispose: () => {
        this.#references.clear();
        this.#releaseLifecycle = undefined;
      },
    });
  }
}

function toReferenceData(
  reference: ReferencePanel,
  replaced: boolean,
  unchanged: boolean,
  environmentRevision: number,
  focused: boolean,
) {
  return {
    referenceId: reference.referenceId,
    title: reference.title,
    surfaceId: reference.surfaceId,
    visible: true,
    focused,
    replaced,
    unchanged,
    contentLength: reference.content.length,
    snippetLanguageIds: reference.snippets.map(({ languageId }) => languageId),
    evidence: {
      environmentRevision,
    },
  };
}

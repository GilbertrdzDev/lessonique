import type { SurfaceConfiguration } from "@/core/platform/contracts";
import {
  MonacoGuidanceAdapter,
  ScenePresentationStore,
  SceneRunner,
  SceneStore,
  WaitCoordinator,
  type ScenePreparation,
  type SceneSurfacePreparer,
} from "@/core/scene";
import { TargetResolverFacade } from "@/core/workspace/target-resolver-facade";

import {
  P0_GUIDANCE_EFFECT_IDS,
  P0_INTERACTION_EVENT_TYPE_IDS,
  P0_TARGET_RESOLVER_IDS,
} from "./provider-platform";
import type { P0WorkspaceRuntime } from "./workspace-runtime";

export interface P0SceneRuntime {
  store: SceneStore;
  presentation: ScenePresentationStore;
  runner: SceneRunner;
}

export function createP0SceneRuntime(
  workspace: Pick<
    P0WorkspaceRuntime,
    | "registries"
    | "store"
    | "controller"
    | "lessonStore"
    | "classroomLifecycle"
    | "interactionTracker"
    | "evaluateCurrentStep"
    | "validation"
    | "monacoEditorAdapter"
    | "previewSurfaceAdapter"
    | "consoleSurfaceAdapter"
    | "interactionAnchorAdapter"
  >,
): P0SceneRuntime {
  const store = new SceneStore();
  const presentation = new ScenePresentationStore();
  const targets = new TargetResolverFacade(workspace.registries.targetResolvers, [
    workspace.monacoEditorAdapter,
    workspace.previewSurfaceAdapter,
    workspace.consoleSurfaceAdapter,
    workspace.interactionAnchorAdapter,
  ]);
  const waits = new WaitCoordinator({
    interactions: workspace.interactionTracker,
    validation: workspace.validation.engine,
    lesson: workspace.lessonStore,
  });
  const runner = new SceneRunner({
    platform: workspace.registries,
    lesson: workspace.lessonStore,
    lifecycle: workspace.classroomLifecycle,
    targets,
    waits,
    exerciseEvaluator: workspace.evaluateCurrentStep,
    exerciseInteractionTypeIds: [P0_INTERACTION_EVENT_TYPE_IDS.editorChange],
    interactions: workspace.interactionTracker,
    store,
    presentation,
    surfacePreparer: new P0SceneSurfacePreparer(workspace),
    monacoGuidance: new MonacoGuidanceAdapter({
      editor: workspace.monacoEditorAdapter,
      resolverId: P0_TARGET_RESOLVER_IDS.codeRange,
      focusEffectId: P0_GUIDANCE_EFFECT_IDS.focus,
    }),
    getViewport: () => ({
      width: globalThis.innerWidth || 1280,
      height: globalThis.innerHeight || 720,
    }),
    prefersReducedMotion: () =>
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  });
  return { store, presentation, runner };
}

class P0SceneSurfacePreparer implements SceneSurfacePreparer {
  readonly #workspace: Pick<
    P0WorkspaceRuntime,
    "registries" | "store" | "controller"
  >;

  constructor(
    workspace: Pick<
      P0WorkspaceRuntime,
      "registries" | "store" | "controller"
    >,
  ) {
    this.#workspace = workspace;
  }

  async prepare(
    preparation: ScenePreparation,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);
    if (preparation.filePath) {
      await this.#workspace.controller.openFile(preparation.filePath);
    }
    throwIfAborted(signal);
    if (!preparation.surfaceId) return;
    const state = this.#workspace.store.getSnapshot();
    if (!state.profileId) throw new Error("The workspace has no active profile.");
    const profile = this.#workspace.registries.environmentProfiles.require(
      state.profileId,
    );
    if (!profile.allowedSurfaceIds.includes(preparation.surfaceId)) {
      throw new Error(
        `Surface "${preparation.surfaceId}" is not available in profile "${profile.id}".`,
      );
    }
    const definition = this.#workspace.registries.surfaces.require(
      preparation.surfaceId,
    );
    if (
      preparation.viewportId &&
      !definition.supportedModeIds.includes(preparation.viewportId)
    ) {
      throw new Error(
        `Viewport "${preparation.viewportId}" is not supported by surface "${definition.id}".`,
      );
    }
    const surfaces = state.surfaces.map((surface): SurfaceConfiguration => ({
      id: surface.id,
      visible:
        surface.id === preparation.surfaceId ? true : surface.visible,
      order: surface.order,
      ...(surface.placementId ? { placementId: surface.placementId } : {}),
      ...(surface.id === preparation.surfaceId && preparation.viewportId
        ? { modeId: preparation.viewportId }
        : surface.modeId
          ? { modeId: surface.modeId }
          : {}),
      ...(surface.size !== undefined ? { size: surface.size } : {}),
      options: Object.entries(surface.options).map(([optionId, value]) => ({
        optionId,
        value,
      })),
    }));
    await this.#workspace.controller.configureSurfaces(surfaces);
    throwIfAborted(signal);
    this.#workspace.controller.activateSurface(preparation.surfaceId);
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Scene preparation was cancelled.", "AbortError");
  }
}

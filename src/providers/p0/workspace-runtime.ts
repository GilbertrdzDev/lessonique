import { MonacoEditorAdapter } from "@/adapters/editor/monaco-editor-adapter";
import { ConsoleSurfaceAdapter } from "@/adapters/console/console-surface-adapter";
import { PreviewSurfaceAdapter } from "@/adapters/preview/preview-surface-adapter";
import { SandpackRuntimeAdapter } from "@/adapters/runtime/sandpack-runtime-adapter";
import { InteractionAnchorAdapter } from "@/adapters/surface/interaction-anchor-adapter";
import {
  ClassroomLifecycleService,
  CreateGuidedLessonUseCase,
  AssistantIntentMapper,
  InteractionTracker,
  LessonStore,
  ResetClassroomUseCase,
} from "@/core/lesson";
import {
  InMemorySurfaceAdapter,
  RuntimeAdapterFactory,
  SurfaceAdapterRegistry,
  WorkspaceController,
  WorkspaceStore,
} from "@/core/workspace";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import { ReferencePanelStore } from "@/core/reference";
import type {
  P0CodeIntelligenceRuntime,
  P0ValidationRuntime,
} from "./code-intelligence";
import {
  createP0CodeIntelligenceRuntime,
  createP0ValidationRuntime,
} from "./code-intelligence";

import {
  createP0ProviderPlatform,
  P0_ASSISTANT_STATE_IDS,
  P0_ENVIRONMENT_ACTION_IDS,
  P0_INTERACTION_EVENT_TYPE_IDS,
  P0_REFERENCE_SURFACE_MODE_ID,
  P0_RUNTIME_PROVIDER_IDS,
  P0_SURFACE_IDS,
  P0_TARGET_RESOLVER_IDS,
} from "./provider-platform";
import { createP0SceneRuntime, type P0SceneRuntime } from "./scene-runtime";

export interface P0WorkspaceRuntime {
  registries: ProviderPlatformRegistries;
  store: WorkspaceStore;
  controller: WorkspaceController;
  lessonStore: LessonStore;
  classroomLifecycle: ClassroomLifecycleService;
  createGuidedLesson: CreateGuidedLessonUseCase;
  resetClassroom: ResetClassroomUseCase;
  codeIntelligence: P0CodeIntelligenceRuntime;
  validation: P0ValidationRuntime;
  interactionTracker: InteractionTracker;
  assistantIntents: AssistantIntentMapper;
  scene: P0SceneRuntime;
  referencePanels: ReferencePanelStore;
  referenceSurfaceModeId: string;
  monacoEditorAdapter: MonacoEditorAdapter;
  previewSurfaceAdapter: PreviewSurfaceAdapter;
  consoleSurfaceAdapter: ConsoleSurfaceAdapter;
  interactionAnchorAdapter: InteractionAnchorAdapter;
  sandpackRuntimeAdapter: SandpackRuntimeAdapter;
  dispose(): Promise<void>;
}

export function createP0WorkspaceRuntime(): P0WorkspaceRuntime {
  const registries = createP0ProviderPlatform();
  const store = new WorkspaceStore();
  const codeIntelligence = createP0CodeIntelligenceRuntime(registries);
  const surfaceAdapters = new SurfaceAdapterRegistry();
  const runtimeAdapters = new RuntimeAdapterFactory();

  const monacoEditorAdapter = new MonacoEditorAdapter({
    surfaceId: P0_SURFACE_IDS.editor,
    codeTargetResolverId: P0_TARGET_RESOLVER_IDS.codeRange,
    focusActionId: P0_ENVIRONMENT_ACTION_IDS.focusEditor,
    openFile: async (path) => controller.openFile(path),
    getActiveFilePath: () => store.getSnapshot().activeFilePath,
    editorChangeEventTypeId: P0_INTERACTION_EVENT_TYPE_IDS.editorChange,
    getEnvironmentRevision: () => store.getSnapshot().environmentRevision,
  });
  const previewSurfaceAdapter = new PreviewSurfaceAdapter({
    surfaceId: P0_SURFACE_IDS.preview,
    previewTargetResolverId: P0_TARGET_RESOLVER_IDS.previewAnchor,
    reloadActionId: P0_ENVIRONMENT_ACTION_IDS.reloadPreview,
    interactionEventTypeIds: {
      click: P0_INTERACTION_EVENT_TYPE_IDS.previewClick,
      change: P0_INTERACTION_EVENT_TYPE_IDS.previewChange,
      submit: P0_INTERACTION_EVENT_TYPE_IDS.previewSubmit,
    },
    getEnvironmentRevision: () => store.getSnapshot().environmentRevision,
    getPreviewTargetQuery: (anchorId) =>
      codeIntelligence.previewQueries.get(anchorId),
  });
  const consoleSurfaceAdapter = new ConsoleSurfaceAdapter(
    P0_SURFACE_IDS.console,
    P0_TARGET_RESOLVER_IDS.consoleEntry,
  );
  const validation = createP0ValidationRuntime(
    registries,
    codeIntelligence,
    store,
    previewSurfaceAdapter,
  );
  const interactionAnchorAdapter = new InteractionAnchorAdapter({
    resolverId: P0_TARGET_RESOLVER_IDS.surfaceAnchor,
    activationEventTypeId: P0_INTERACTION_EVENT_TYPE_IDS.surfaceActivate,
    definitions: registries.interactionAnchors,
    getEnvironmentRevision: () => store.getSnapshot().environmentRevision,
  });

  surfaceAdapters.register(monacoEditorAdapter);
  surfaceAdapters.register(previewSurfaceAdapter);
  surfaceAdapters.register(consoleSurfaceAdapter);
  [
    P0_SURFACE_IDS.values,
    P0_SURFACE_IDS.plan,
    P0_SURFACE_IDS.activity,
    P0_SURFACE_IDS.reference,
  ].forEach(
    (surfaceId) => surfaceAdapters.register(new InMemorySurfaceAdapter(surfaceId)),
  );

  const sandpackRuntimeAdapter = new SandpackRuntimeAdapter(
    P0_RUNTIME_PROVIDER_IDS.sandpackVanilla,
    {
      run: P0_ENVIRONMENT_ACTION_IDS.run,
      stop: P0_ENVIRONMENT_ACTION_IDS.stop,
      restart: P0_ENVIRONMENT_ACTION_IDS.restart,
      clearConsole: P0_ENVIRONMENT_ACTION_IDS.clearConsole,
    },
  );
  runtimeAdapters.register(
    P0_RUNTIME_PROVIDER_IDS.sandpackVanilla,
    () => sandpackRuntimeAdapter,
  );
  const controller = new WorkspaceController({
    store,
    registries,
    surfaceAdapters,
    runtimeAdapters,
  });
  const lessonStore = new LessonStore();
  const referencePanels = new ReferencePanelStore();
  const classroomLifecycle = new ClassroomLifecycleService();
  const classroomDependencies = {
    lessonStore,
    workspace: controller,
    lifecycle: classroomLifecycle,
  };
  const createGuidedLesson = new CreateGuidedLessonUseCase(classroomDependencies);
  const resetClassroom = new ResetClassroomUseCase(classroomDependencies);
  const assistantIntents = new AssistantIntentMapper(registries, {
    thinking: P0_ASSISTANT_STATE_IDS.thinking,
    success: P0_ASSISTANT_STATE_IDS.success,
    warning: P0_ASSISTANT_STATE_IDS.warning,
  });
  const interactionTracker = new InteractionTracker({
    store: lessonStore,
    platform: registries,
    lifecycle: classroomLifecycle,
    assistantIntents,
    getEnvironmentRevision: () => store.getSnapshot().environmentRevision,
    onInteraction: (event) => controller.recordInteraction(event),
  });

  let analyzedFiles = store.getSnapshot().files;
  const unsubscribeCodeAnalysis = store.subscribe(() => {
    const state = store.getSnapshot();
    if (state.files === analyzedFiles) return;
    analyzedFiles = state.files;
    codeIntelligence.diagnostics.retain(state.files.map(({ path }) => path));
    state.files.forEach((file) => {
      void codeIntelligence.service
        .analyze({
          path: file.path,
          languageId: file.languageId,
          content: file.content,
          revision: state.environmentRevision,
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            console.error(`Code analysis failed for "${file.path}".`, error);
          }
        });
    });
  });

  interactionTracker.attachSources([
    monacoEditorAdapter,
    previewSurfaceAdapter,
    interactionAnchorAdapter,
  ]);
  const scene = createP0SceneRuntime({
    registries,
    store,
    controller,
    lessonStore,
    classroomLifecycle,
    interactionTracker,
    validation,
    monacoEditorAdapter,
    previewSurfaceAdapter,
    consoleSurfaceAdapter,
    interactionAnchorAdapter,
  });

  return {
    registries,
    store,
    controller,
    lessonStore,
    classroomLifecycle,
    createGuidedLesson,
    resetClassroom,
    codeIntelligence,
    validation,
    interactionTracker,
    assistantIntents,
    scene,
    referencePanels,
    referenceSurfaceModeId: P0_REFERENCE_SURFACE_MODE_ID,
    monacoEditorAdapter,
    previewSurfaceAdapter,
    consoleSurfaceAdapter,
    interactionAnchorAdapter,
    sandpackRuntimeAdapter,
    async dispose() {
      await scene.runner.dispose();
      interactionTracker.detachSources();
      unsubscribeCodeAnalysis();
      codeIntelligence.dispose();
      await classroomLifecycle.cleanup("all", "cancellation");
      await controller.dispose();
      await runtimeAdapters.dispose();
    },
  };
}

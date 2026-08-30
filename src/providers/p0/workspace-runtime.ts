import { MonacoEditorAdapter } from "@/adapters/editor/monaco-editor-adapter";
import { ConsoleSurfaceAdapter } from "@/adapters/console/console-surface-adapter";
import { PreviewSurfaceAdapter } from "@/adapters/preview/preview-surface-adapter";
import { SandpackRuntimeAdapter } from "@/adapters/runtime/sandpack-runtime-adapter";
import { InteractionAnchorAdapter } from "@/adapters/surface/interaction-anchor-adapter";
import {
  ClassroomLifecycleService,
  CreateGuidedLessonUseCase,
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

import {
  createP0ProviderPlatform,
  P0_ENVIRONMENT_ACTION_IDS,
  P0_INTERACTION_EVENT_TYPE_IDS,
  P0_RUNTIME_PROVIDER_IDS,
  P0_SURFACE_IDS,
  P0_TARGET_RESOLVER_IDS,
} from "./provider-platform";

export interface P0WorkspaceRuntime {
  registries: ProviderPlatformRegistries;
  store: WorkspaceStore;
  controller: WorkspaceController;
  lessonStore: LessonStore;
  classroomLifecycle: ClassroomLifecycleService;
  createGuidedLesson: CreateGuidedLessonUseCase;
  resetClassroom: ResetClassroomUseCase;
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
  const surfaceAdapters = new SurfaceAdapterRegistry();
  const runtimeAdapters = new RuntimeAdapterFactory();

  const monacoEditorAdapter = new MonacoEditorAdapter({
    surfaceId: P0_SURFACE_IDS.editor,
    codeTargetResolverId: P0_TARGET_RESOLVER_IDS.codeRange,
    focusActionId: P0_ENVIRONMENT_ACTION_IDS.focusEditor,
    openFile: async (path) => controller.openFile(path),
    getActiveFilePath: () => store.getSnapshot().activeFilePath,
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
  });
  const consoleSurfaceAdapter = new ConsoleSurfaceAdapter(
    P0_SURFACE_IDS.console,
    P0_TARGET_RESOLVER_IDS.consoleEntry,
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
  [P0_SURFACE_IDS.values, P0_SURFACE_IDS.plan, P0_SURFACE_IDS.activity].forEach(
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
  const classroomLifecycle = new ClassroomLifecycleService();
  const classroomDependencies = {
    lessonStore,
    workspace: controller,
    lifecycle: classroomLifecycle,
  };
  const createGuidedLesson = new CreateGuidedLessonUseCase(classroomDependencies);
  const resetClassroom = new ResetClassroomUseCase(classroomDependencies);

  const interactionSubscription = new AbortController();
  previewSurfaceAdapter.subscribeToInteractions(
    (event) => controller.recordInteraction(event),
    interactionSubscription.signal,
  );
  interactionAnchorAdapter.subscribeToInteractions(
    (event) => controller.recordInteraction(event),
    interactionSubscription.signal,
  );

  return {
    registries,
    store,
    controller,
    lessonStore,
    classroomLifecycle,
    createGuidedLesson,
    resetClassroom,
    monacoEditorAdapter,
    previewSurfaceAdapter,
    consoleSurfaceAdapter,
    interactionAnchorAdapter,
    sandpackRuntimeAdapter,
    async dispose() {
      interactionSubscription.abort();
      await classroomLifecycle.cleanup("all", "cancellation");
      await controller.dispose();
      await runtimeAdapters.dispose();
    },
  };
}

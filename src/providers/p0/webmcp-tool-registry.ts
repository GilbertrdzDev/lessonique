import { createEarlyWebMCPToolRegistry } from "@/core/webmcp";

import type { P0WorkspaceRuntime } from "./workspace-runtime";

export function createP0WebMCPToolRegistry(runtime: P0WorkspaceRuntime) {
  return createEarlyWebMCPToolRegistry(runtime.registries, {
    guideBuild: runtime.guideBuild,
    workspaceController: runtime.controller,
    createGuidedLesson: runtime.createGuidedLesson,
    resetClassroom: runtime.resetClassroom,
    lessonState: runtime.lessonStore,
    lessonStore: runtime.lessonStore,
    workspaceState: runtime.store,
    classroomLifecycle: runtime.classroomLifecycle,
    codeIntelligence: runtime.codeIntelligence.service,
    diagnostics: runtime.codeIntelligence.diagnostics,
    validationResults: runtime.validation.results,
    sceneRunner: runtime.scene.runner,
    sceneState: runtime.scene.store,
    validationEngine: runtime.validation.engine,
    assistantIntents: runtime.assistantIntents,
    referencePanels: runtime.referencePanels,
    referenceSurfaceModeId: runtime.referenceSurfaceModeId,
  });
}

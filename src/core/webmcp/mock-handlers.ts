import { CapabilityCatalog } from "@/core/platform/capability-catalog";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import type {
  DiagnosticSnapshotStore,
  ValidationEngine,
  ValidationResultSnapshotStore,
  CodeIntelligenceService,
} from "@/core/code-intelligence";
import type {
  ClassroomLifecycleService,
  AssistantIntentMapper,
  CreateGuidedLessonUseCase,
  LessonStateReader,
  LessonStoreAdapter,
  ResetClassroomUseCase,
} from "@/core/lesson";
import type { ReferencePanelStore } from "@/core/reference";
import type { SceneRunner, SceneStore } from "@/core/scene";
import type { WorkspaceStateReader } from "@/core/workspace";
import type { WorkspaceController } from "@/core/workspace/workspace-controller";
import type { z } from "zod";

import {
  CapabilityValidator,
  GetSystemCapabilitiesService,
} from "./capabilities";
import { ApplyWorkspaceChangesService } from "./apply-workspace-changes";
import { ConfigureLearningEnvironmentService } from "./configure-learning-environment";
import { ClassroomToolService } from "./classroom-tools";
import { ExecuteEnvironmentActionService } from "./execute-environment-action";
import { EvaluateCurrentStepService } from "./evaluate-current-step";
import { InspectClassroomService } from "./inspect-classroom";
import { ShowReferencePanelService } from "./show-reference-panel";
import { TeachingSceneToolService } from "./teaching-scene-tools";
import { UpdateLessonPlanService } from "./update-lesson-plan";
import type { ToolHandler, ToolExecutionResult, WebMCPToolInputMap } from "./contracts";
import { WEBMCP_TOOL_INPUT_SCHEMAS } from "./schemas";
import { ToolRegistry, type ToolDefinition } from "./tool-registry";
import { WEBMCP_TOOL_NAMES, type WebMCPToolName } from "./tool-names";

const TOOL_METADATA = {
  get_system_capabilities: {
    title: "Get system capabilities",
    description: "Discover registered profiles, providers, surfaces, actions, guidance capabilities, and limits.",
  },
  create_guided_lesson: {
    title: "Create guided lesson",
    description: "Create or replace a complete guided lesson transactionally. Always declare lessonMode. Use explain when the learner asks to understand, learn, see, or be shown a concept: provide complete example code and progressive explanation beats, not a workspace full of TODOs. Use practice only when the learner asks for an exercise, challenge, TODO, or hands-on work. Use mixed for a demonstration followed by a small validated exercise.",
  },
  reset_classroom: {
    title: "Reset classroom",
    description: "Clear a declared classroom lifecycle scope idempotently.",
  },
  inspect_classroom: {
    title: "Inspect classroom",
    description: "Inspect a bounded, filtered snapshot of the active classroom.",
  },
  configure_learning_environment: {
    title: "Configure learning environment",
    description: "Reconfigure registered profiles, providers, files, surfaces, and scalar options.",
  },
  apply_workspace_changes: {
    title: "Apply workspace changes",
    description: "Apply an atomic batch of validated workspace file operations.",
  },
  execute_environment_action: {
    title: "Execute environment action",
    description: "Execute a capability-declared runtime, profile, or surface action.",
  },
  play_teaching_scene: {
    title: "Play teaching scene",
    description: "Start a visual teaching scene using semantic targets and registered guidance capabilities. Author one small concept per explanation beat and target the narrowest useful token or expression. Set allowManualNavigation for learner-controlled Previous and Next. Interaction beats are for learner work, must include a registered wait, and automatically remove invasive guidance; validation and feedback beats check and respond without exposing arbitrary code execution.",
  },
  control_teaching_scene: {
    title: "Control teaching scene",
    description: "Pause, resume, navigate, restart, or cancel the active teaching scene. Learners normally use Lessonique's local Previous and Next controls; use this tool for agent-directed recovery, remote control, restart, or cancellation, never to bypass a blocked learner interaction.",
  },
  evaluate_current_step: {
    title: "Evaluate current step",
    description: "Evaluate the active lesson step with its declared criteria. Use this for practice or the exercise portion of mixed lessons after learner interaction; do not invent criteria or evaluate a read-only explanation merely to advance it.",
  },
  update_lesson_plan: {
    title: "Update lesson plan",
    description: "Adapt lesson steps, active progress, hints, or the agent message without changing the workspace.",
  },
  show_reference_panel: {
    title: "Show reference panel",
    description: "Create or replace a structured, non-modal reference panel.",
  },
} as const satisfies Record<WebMCPToolName, { title: string; description: string }>;

export type EarlyWebMCPIntegrations = {
  workspaceController?: WorkspaceController;
  createGuidedLesson?: CreateGuidedLessonUseCase;
  resetClassroom?: ResetClassroomUseCase;
  lessonState?: LessonStateReader;
  lessonStore?: LessonStoreAdapter;
  workspaceState?: WorkspaceStateReader;
  classroomLifecycle?: ClassroomLifecycleService;
  codeIntelligence?: CodeIntelligenceService;
  diagnostics?: DiagnosticSnapshotStore;
  validationResults?: ValidationResultSnapshotStore;
  sceneRunner?: SceneRunner;
  sceneState?: SceneStore;
  validationEngine?: ValidationEngine;
  assistantIntents?: AssistantIntentMapper;
  referencePanels?: ReferencePanelStore;
  referenceSurfaceModeId?: string;
};

export function createEarlyWebMCPToolRegistry(
  registries: ProviderPlatformRegistries,
  integrations: EarlyWebMCPIntegrations = {},
): ToolRegistry {
  const registry = new ToolRegistry();
  const capabilities = new GetSystemCapabilitiesService(
    new CapabilityCatalog(registries),
    new CapabilityValidator(registries),
  );
  registerDefinition(registry, {
    name: "get_system_capabilities",
    ...TOOL_METADATA.get_system_capabilities,
    inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.get_system_capabilities,
    handler: (input) => ({
      ok: true,
      status: "completed",
      data: capabilities.execute(input),
    }),
  });

  const configuration = integrations.workspaceController
    ? new ConfigureLearningEnvironmentService(
        integrations.workspaceController,
        registries,
      )
    : undefined;
  const workspaceChanges = integrations.workspaceController
    ? new ApplyWorkspaceChangesService(
        integrations.workspaceController,
        registries,
      )
    : undefined;
  const environmentActions = integrations.workspaceController
    ? new ExecuteEnvironmentActionService(
        integrations.workspaceController,
        registries,
      )
    : undefined;
  const scenes = integrations.sceneRunner
    ? new TeachingSceneToolService(integrations.sceneRunner)
    : undefined;
  const evaluation =
    integrations.lessonStore &&
    integrations.validationEngine &&
    integrations.assistantIntents
      ? new EvaluateCurrentStepService({
          lesson: integrations.lessonStore,
          validation: integrations.validationEngine,
          registries,
          assistantIntents: integrations.assistantIntents,
        })
      : undefined;
  const planUpdates =
    integrations.lessonStore && integrations.workspaceState
      ? new UpdateLessonPlanService({
          lesson: integrations.lessonStore,
          workspace: integrations.workspaceState,
          registries,
        })
      : undefined;
  const references =
    integrations.workspaceController &&
    integrations.classroomLifecycle &&
    integrations.referencePanels &&
    integrations.referenceSurfaceModeId
      ? new ShowReferencePanelService({
          workspace: integrations.workspaceController,
          registries,
          lifecycle: integrations.classroomLifecycle,
          references: integrations.referencePanels,
          compatibleModeId: integrations.referenceSurfaceModeId,
        })
      : undefined;
  const classroom =
    integrations.workspaceController &&
    integrations.createGuidedLesson &&
    integrations.resetClassroom
      ? new ClassroomToolService({
          workspace: integrations.workspaceController,
          registries,
          createLesson: integrations.createGuidedLesson,
          resetClassroom: integrations.resetClassroom,
          scenes,
          lifecycle: integrations.classroomLifecycle,
        })
      : undefined;
  const inspection =
    integrations.lessonState &&
    integrations.workspaceState &&
    integrations.classroomLifecycle &&
    integrations.codeIntelligence &&
    integrations.diagnostics &&
    integrations.validationResults
      ? new InspectClassroomService({
          registries,
          lesson: integrations.lessonState,
          workspace: integrations.workspaceState,
          lifecycle: integrations.classroomLifecycle,
          intelligence: integrations.codeIntelligence,
          diagnostics: integrations.diagnostics,
          validationResults: integrations.validationResults,
          scene: integrations.sceneState,
          activity: registry.activityLogger,
        })
      : undefined;

  for (const name of WEBMCP_TOOL_NAMES) {
    if (name === "get_system_capabilities") continue;
    if (name === "create_guided_lesson" && classroom) {
      registerDefinition(registry, {
        name,
        ...TOOL_METADATA.create_guided_lesson,
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.create_guided_lesson,
        capabilityCheck: (input) => classroom.validateCreate(input),
        handler: (input, context) => classroom.create(input, context.signal),
      });
      continue;
    }
    if (name === "reset_classroom" && classroom) {
      registerDefinition(registry, {
        name,
        ...TOOL_METADATA.reset_classroom,
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.reset_classroom,
        handler: (input) => classroom.reset(input),
      });
      continue;
    }
    if (name === "inspect_classroom" && inspection) {
      registerDefinition(registry, {
        name,
        ...TOOL_METADATA.inspect_classroom,
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.inspect_classroom,
        handler: (input, context) => inspection.execute(input, context.signal),
      });
      continue;
    }
    if (name === "configure_learning_environment" && configuration) {
      registerDefinition(registry, {
        name,
        ...TOOL_METADATA.configure_learning_environment,
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.configure_learning_environment,
        capabilityCheck: (input) => configuration.validate(input),
        handler: (input) => configuration.execute(input),
      });
      continue;
    }
    if (name === "apply_workspace_changes" && workspaceChanges) {
      registerDefinition(registry, {
        name,
        ...TOOL_METADATA.apply_workspace_changes,
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.apply_workspace_changes,
        capabilityCheck: (input) => workspaceChanges.validate(input),
        handler: (input) => workspaceChanges.execute(input),
      });
      continue;
    }
    if (name === "execute_environment_action" && environmentActions) {
      registerDefinition(registry, {
        name,
        ...TOOL_METADATA.execute_environment_action,
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.execute_environment_action,
        capabilityCheck: (input) => environmentActions.validate(input),
        handler: (input) => environmentActions.execute(input),
      });
      continue;
    }
    if (name === "play_teaching_scene" && scenes) {
      registerDefinition(registry, {
        name,
        ...TOOL_METADATA.play_teaching_scene,
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.play_teaching_scene,
        capabilityCheck: (input) => {
          scenes.validate(input);
        },
        handler: (input, context) => scenes.play(input, context.signal),
      });
      continue;
    }
    if (name === "control_teaching_scene" && scenes) {
      registerDefinition(registry, {
        name,
        ...TOOL_METADATA.control_teaching_scene,
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.control_teaching_scene,
        handler: (input, context) => scenes.control(input, context.signal),
      });
      continue;
    }
    if (name === "evaluate_current_step" && evaluation) {
      registerDefinition(registry, {
        name,
        ...TOOL_METADATA.evaluate_current_step,
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.evaluate_current_step,
        capabilityCheck: (input) => {
          evaluation.validate(input);
        },
        handler: (input, context) =>
          evaluation.execute(input, context.signal),
      });
      continue;
    }
    if (name === "update_lesson_plan" && planUpdates) {
      registerDefinition(registry, {
        name,
        ...TOOL_METADATA.update_lesson_plan,
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.update_lesson_plan,
        capabilityCheck: (input) => planUpdates.validate(input),
        handler: (input) => planUpdates.execute(input),
      });
      continue;
    }
    if (name === "show_reference_panel" && references) {
      registerDefinition(registry, {
        name,
        ...TOOL_METADATA.show_reference_panel,
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.show_reference_panel,
        capabilityCheck: (input) => references.validate(input),
        handler: (input) => references.execute(input),
      });
      continue;
    }
    registerMockDefinition(registry, name);
  }

  return registry;
}

function registerMockDefinition<TName extends Exclude<WebMCPToolName, "get_system_capabilities">>(
  registry: ToolRegistry,
  name: TName,
): void {
  const handler: ToolHandler<TName> = () => {
    const result: ToolExecutionResult<{ mock: true; toolName: TName }> = {
      ok: true,
      status: name === "play_teaching_scene" ? "started" : "completed",
      data: { mock: true, toolName: name },
    };
    return result;
  };
  registerDefinition(registry, {
    name,
    ...TOOL_METADATA[name],
    inputSchema: getInputSchema(name),
    handler,
  });
}

function getInputSchema<TName extends WebMCPToolName>(
  name: TName,
): z.ZodType<WebMCPToolInputMap[TName]> {
  return WEBMCP_TOOL_INPUT_SCHEMAS[name] as unknown as z.ZodType<
    WebMCPToolInputMap[TName]
  >;
}

function registerDefinition<TName extends WebMCPToolName>(
  registry: ToolRegistry,
  definition: ToolDefinition<TName>,
): void {
  registry.register(definition);
}

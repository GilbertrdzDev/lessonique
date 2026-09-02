import type { z } from "zod";

import type {
  applyWorkspaceChangesInputSchema,
  configureLearningEnvironmentInputSchema,
  controlTeachingSceneInputSchema,
  createGuidedLessonInputSchema,
  evaluateCurrentStepInputSchema,
  executeEnvironmentActionInputSchema,
  getSystemCapabilitiesInputSchema,
  inspectClassroomInputSchema,
  lessonStepInputSchema,
  playTeachingSceneInputSchema,
  resetClassroomInputSchema,
  setGuideBuildStatusInputSchema,
  showReferencePanelInputSchema,
  surfaceConfigurationInputSchema,
  targetRefSchema,
  teachingSceneInputSchema,
  updateLessonPlanInputSchema,
} from "./schemas";
import type { WebMCPToolName } from "./tool-names";

export type GetSystemCapabilitiesInput = z.infer<typeof getSystemCapabilitiesInputSchema>;
export type SetGuideBuildStatusInput = z.infer<typeof setGuideBuildStatusInputSchema>;
export type CreateGuidedLessonInput = z.infer<typeof createGuidedLessonInputSchema>;
export type ResetClassroomInput = z.infer<typeof resetClassroomInputSchema>;
export type InspectClassroomInput = z.infer<typeof inspectClassroomInputSchema>;
export type ConfigureLearningEnvironmentInput = z.infer<
  typeof configureLearningEnvironmentInputSchema
>;
export type ApplyWorkspaceChangesInput = z.infer<typeof applyWorkspaceChangesInputSchema>;
export type ExecuteEnvironmentActionInput = z.infer<
  typeof executeEnvironmentActionInputSchema
>;
export type PlayTeachingSceneInput = z.infer<typeof playTeachingSceneInputSchema>;
export type ControlTeachingSceneInput = z.infer<typeof controlTeachingSceneInputSchema>;
export type EvaluateCurrentStepInput = z.infer<typeof evaluateCurrentStepInputSchema>;
export type UpdateLessonPlanInput = z.infer<typeof updateLessonPlanInputSchema>;
export type ShowReferencePanelInput = z.infer<typeof showReferencePanelInputSchema>;
export type SurfaceConfigurationInput = z.infer<typeof surfaceConfigurationInputSchema>;
export type TargetRefInput = z.infer<typeof targetRefSchema>;
export type TeachingSceneInput = z.infer<typeof teachingSceneInputSchema>;
export type LessonStepInput = z.infer<typeof lessonStepInputSchema>;

export type WebMCPToolInputMap = {
  get_system_capabilities: GetSystemCapabilitiesInput;
  set_guide_build_status: SetGuideBuildStatusInput;
  create_guided_lesson: CreateGuidedLessonInput;
  reset_classroom: ResetClassroomInput;
  inspect_classroom: InspectClassroomInput;
  configure_learning_environment: ConfigureLearningEnvironmentInput;
  apply_workspace_changes: ApplyWorkspaceChangesInput;
  execute_environment_action: ExecuteEnvironmentActionInput;
  play_teaching_scene: PlayTeachingSceneInput;
  control_teaching_scene: ControlTeachingSceneInput;
  evaluate_current_step: EvaluateCurrentStepInput;
  update_lesson_plan: UpdateLessonPlanInput;
  show_reference_panel: ShowReferencePanelInput;
};

export type ToolResultStatus = "completed" | "started" | "cancelled" | "failed";

export type ToolResultError = {
  code: string;
  message: string;
  recoverable: boolean;
  supportedAlternatives?: string[];
};

export type ToolResult<T> = {
  ok: boolean;
  operationId: string;
  status: ToolResultStatus;
  revision?: number;
  data?: T;
  error?: ToolResultError;
};

export type ToolExecutionResult<T> = Omit<ToolResult<T>, "operationId">;

export type ToolInvocationContext = {
  operationId: string;
  signal: AbortSignal;
};

export type ToolHandler<TName extends WebMCPToolName> = (
  input: WebMCPToolInputMap[TName],
  context: ToolInvocationContext,
) => Promise<ToolExecutionResult<unknown>> | ToolExecutionResult<unknown>;

export type ToolCapabilityCheck<TName extends WebMCPToolName> = (
  input: WebMCPToolInputMap[TName],
  context: ToolInvocationContext,
) => Promise<void> | void;

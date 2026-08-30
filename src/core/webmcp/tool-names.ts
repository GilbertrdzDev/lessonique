export const WEBMCP_TOOL_NAMES = [
  "get_system_capabilities",
  "create_guided_lesson",
  "reset_classroom",
  "inspect_classroom",
  "configure_learning_environment",
  "apply_workspace_changes",
  "execute_environment_action",
  "play_teaching_scene",
  "control_teaching_scene",
  "evaluate_current_step",
  "update_lesson_plan",
  "show_reference_panel",
] as const;

export type WebMCPToolName = (typeof WEBMCP_TOOL_NAMES)[number];

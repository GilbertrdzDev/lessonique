import type { LessonLifecycleStatus } from "@/core/lesson";
import type { WorkspaceStatus } from "@/core/workspace";

export type LessoniqueExperienceState =
  | "unsupported"
  | "supported-disconnected"
  | "connected"
  | "starting-session"
  | "classroom";

export type AgentConnectionStatus = "disconnected" | "connected";

export type ExperienceStateInput = Readonly<{
  agentConnection: AgentConnectionStatus;
  classroomTransitionComplete: boolean;
  hasWorkspaceEnvironment: boolean;
  lessonStatus: LessonLifecycleStatus;
  webMCPAvailability: "detecting" | "ready" | "unsupported";
  workspaceStatus: WorkspaceStatus;
}>;

export function resolveLessoniqueExperienceState(
  input: ExperienceStateInput,
): LessoniqueExperienceState {
  const hasLesson =
    input.lessonStatus === "active" ||
    input.lessonStatus === "completed" ||
    input.lessonStatus === "failed";

  if (hasLesson || input.lessonStatus === "preparing") {
    const environmentReady =
      input.hasWorkspaceEnvironment &&
      input.workspaceStatus !== "idle" &&
      input.workspaceStatus !== "preparing";
    return environmentReady && input.classroomTransitionComplete
      ? "classroom"
      : "starting-session";
  }

  if (input.webMCPAvailability === "unsupported") {
    return "unsupported";
  }

  if (
    input.webMCPAvailability === "ready" &&
    input.agentConnection === "connected"
  ) {
    return "connected";
  }

  return "supported-disconnected";
}

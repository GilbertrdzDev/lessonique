import type { LessonLifecycleStatus } from "@/core/lesson";
import type { GuideBuildStatus } from "@/core/guide-build";
import type { WorkspaceStatus } from "@/core/workspace";

export type LessoniqueExperienceState =
  | "unsupported"
  | "supported-disconnected"
  | "connected"
  | "building-guide"
  | "guide-build-error"
  | "starting-session"
  | "classroom";

export type AgentConnectionStatus = "disconnected" | "connected";

export type ExperienceStateInput = Readonly<{
  agentConnection: AgentConnectionStatus;
  classroomTransitionComplete: boolean;
  guideBuildStatus: GuideBuildStatus;
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
  const environmentReady =
    input.hasWorkspaceEnvironment &&
    input.workspaceStatus !== "idle" &&
    input.workspaceStatus !== "preparing";

  if (hasLesson && environmentReady && input.classroomTransitionComplete) {
    return "classroom";
  }

  if (input.guideBuildStatus === "building") return "building-guide";
  if (input.guideBuildStatus === "error") return "guide-build-error";

  if (hasLesson || input.lessonStatus === "preparing") {
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

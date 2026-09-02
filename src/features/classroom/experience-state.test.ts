import { describe, expect, it } from "vitest";

import { resolveLessoniqueExperienceState } from "./experience-state";

const idleInput = {
  agentConnection: "disconnected" as const,
  classroomTransitionComplete: false,
  guideBuildStatus: "idle" as const,
  hasWorkspaceEnvironment: false,
  lessonStatus: "idle" as const,
  webMCPAvailability: "detecting" as const,
  workspaceStatus: "idle" as const,
};

describe("Lessonique experience state", () => {
  it("separates unsupported, registered, and agent-connected lobby states", () => {
    expect(
      resolveLessoniqueExperienceState({
        ...idleInput,
        webMCPAvailability: "unsupported",
      }),
    ).toBe("unsupported");
    expect(
      resolveLessoniqueExperienceState({
        ...idleInput,
        webMCPAvailability: "ready",
      }),
    ).toBe("supported-disconnected");
    expect(
      resolveLessoniqueExperienceState({
        ...idleInput,
        agentConnection: "connected",
        webMCPAvailability: "ready",
      }),
    ).toBe("connected");
  });

  it("holds a real session in its transition before mounting the classroom", () => {
    const activeSession = {
      ...idleInput,
      agentConnection: "connected" as const,
      hasWorkspaceEnvironment: true,
      lessonStatus: "active" as const,
      webMCPAvailability: "ready" as const,
      workspaceStatus: "ready" as const,
    };
    expect(resolveLessoniqueExperienceState(activeSession)).toBe(
      "starting-session",
    );
    expect(
      resolveLessoniqueExperienceState({
        ...activeSession,
        classroomTransitionComplete: true,
      }),
    ).toBe("classroom");
  });

  it("keeps an already-open classroom mounted while replacing its guide", () => {
    const existingSession = {
      ...idleInput,
      classroomTransitionComplete: true,
      hasWorkspaceEnvironment: true,
      lessonStatus: "active" as const,
      workspaceStatus: "ready" as const,
    };

    expect(
      resolveLessoniqueExperienceState({
        ...existingSession,
        guideBuildStatus: "building",
      }),
    ).toBe("classroom");
    expect(
      resolveLessoniqueExperienceState({
        ...existingSession,
        guideBuildStatus: "error",
      }),
    ).toBe("classroom");
  });

  it("keeps an existing classroom available when WebMCP disconnects", () => {
    expect(
      resolveLessoniqueExperienceState({
        ...idleInput,
        classroomTransitionComplete: true,
        hasWorkspaceEnvironment: true,
        lessonStatus: "completed",
        webMCPAvailability: "unsupported",
        workspaceStatus: "stopped",
      }),
    ).toBe("classroom");
  });
});

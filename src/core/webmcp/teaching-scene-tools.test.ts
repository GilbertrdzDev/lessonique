import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createP0WorkspaceRuntime } from "@/providers/p0";

import { createEarlyWebMCPToolRegistry } from "./mock-handlers";
import { toTeachingScene } from "./teaching-scene-tools";

describe("teaching scene WebMCP tools", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("applies bounded target retry without exposing recovery policy in the public input", () => {
    const scene = toTeachingScene({
      id: "scene.target-retry",
      beats: [
        {
          id: "beat.target-retry",
          target: {
            resolverId: "target.surface-anchor",
            input: { anchorId: "anchor.learning-plan" },
          },
        },
      ],
    });

    expect(scene.beats[0]?.targetLossRecovery).toBe("retry");
  });

  it("starts immediately, preserves structured guidance, and exposes real control state", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");
    const registry = createRegistry(runtime);

    const started = await registry.invoke("play_teaching_scene", {
      id: "scene.webmcp",
      allowManualNavigation: true,
      beats: [
        {
          id: "beat.guide",
          assistant: {
            stateId: "assistant.explaining",
            placementId: "placement.floating",
          },
          guide: {
            title: "Understand the structure",
            body: "Keep this line.\nKeep the next line.",
            supportingItems: ["First item", "Second item"],
          },
          caption: "A visible explanation",
        },
      ],
    });

    expect(started).toEqual(
      expect.objectContaining({
        ok: true,
        status: "started",
        data: expect.objectContaining({
          sceneId: "scene.webmcp",
          sceneStatus: "preparing",
          beatCount: 1,
          structuredGuideBeatIds: ["beat.guide"],
        }),
      }),
    );
    expect(started.data).not.toEqual(expect.objectContaining({ mock: true }));

    await vi.advanceTimersByTimeAsync(321);
    expect(runtime.scene.presentation.getSnapshot().guide).toEqual({
      title: "Understand the structure",
      body: "Keep this line.\nKeep the next line.",
      supportingItems: ["First item", "Second item"],
    });

    const paused = await registry.invoke("control_teaching_scene", {
      action: "pause",
      sceneId: "scene.webmcp",
    });
    expect(paused).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          action: "pause",
          sceneId: "scene.webmcp",
          sceneStatus: "paused",
        }),
      }),
    );
    const inspection = await registry.invoke("inspect_classroom", {
      include: ["scene", "assistant"],
    });
    expect(inspection.data).toEqual(
      expect.objectContaining({
        scene: expect.objectContaining({
          status: "paused",
          activeSceneId: "scene.webmcp",
          activeBeatId: "beat.guide",
        }),
        assistant: expect.objectContaining({
          stateId: "assistant.explaining",
          sceneId: "scene.webmcp",
          visible: true,
        }),
      }),
    );

    const cancelled = await registry.invoke("control_teaching_scene", {
      action: "cancel",
      sceneId: "scene.webmcp",
    });
    expect(cancelled).toEqual(
      expect.objectContaining({
        ok: false,
        status: "cancelled",
        data: expect.objectContaining({ sceneStatus: "cancelled" }),
      }),
    );
    expect(runtime.scene.presentation.getSnapshot().guide).toBeUndefined();
  });

  it("rejects unsupported scene capabilities and invalid control without mutation", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");
    const registry = createRegistry(runtime);

    const invalidScene = await registry.invoke("play_teaching_scene", {
      id: "scene.invalid",
      beats: [
        {
          id: "beat.invalid",
          target: {
            resolverId: "target.surface-anchor",
            input: { anchorId: "anchor.learning-plan" },
          },
          effects: [{ effectId: "effect.unregistered" }],
        },
      ],
    });

    expect(invalidScene).toEqual(
      expect.objectContaining({
        ok: false,
        status: "failed",
        error: expect.objectContaining({
          code: "invalid_teaching_scene",
          recoverable: true,
        }),
      }),
    );
    expect(runtime.scene.store.getSnapshot().status).toBe("idle");

    const invalidControl = await registry.invoke("control_teaching_scene", {
      action: "pause",
    });
    expect(invalidControl).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "invalid_scene_control" }),
      }),
    );
  });

  it("rejects voice fields in the closed public schema before scene execution", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);

    const result = await registry.invoke("play_teaching_scene", {
      id: "scene.voice",
      narration: "Read this aloud.",
      beats: [{ id: "beat.voice" }],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "invalid_input" }),
      }),
    );
    expect(runtime.scene.store.getSnapshot().status).toBe("idle");
  });
});

function createRegistry(runtime: ReturnType<typeof createP0WorkspaceRuntime>) {
  return createEarlyWebMCPToolRegistry(runtime.registries, {
    workspaceController: runtime.controller,
    createGuidedLesson: runtime.createGuidedLesson,
    resetClassroom: runtime.resetClassroom,
    lessonState: runtime.lessonStore,
    workspaceState: runtime.store,
    classroomLifecycle: runtime.classroomLifecycle,
    codeIntelligence: runtime.codeIntelligence.service,
    diagnostics: runtime.codeIntelligence.diagnostics,
    validationResults: runtime.validation.results,
    sceneRunner: runtime.scene.runner,
    sceneState: runtime.scene.store,
  });
}

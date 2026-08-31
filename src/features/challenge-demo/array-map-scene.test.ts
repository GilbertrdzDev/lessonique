import { describe, expect, it, vi } from "vitest";

import type { ToolResult } from "@/core/webmcp";
import { playTeachingSceneInputSchema } from "@/core/webmcp";

import { ARRAY_MAP_DEMO_IDS } from "./array-map-fixture";
import { ARRAY_MAP_SCENE_ID, createArrayMapScene } from "./array-map-scene";
import { runArrayMapDemoStage } from "./array-map-stage-runner";

const MAP_TARGET = {
  resolverId: "target.code-range",
  input: {
    filePath: "script.js",
    startLine: 2,
    startColumn: 22,
    endLine: 2,
    endColumn: 54,
  },
} as const;

describe("Array.map challenge scene", () => {
  it("moves from semantic code to console validation and evidence-backed success", () => {
    const scene = createArrayMapScene(MAP_TARGET);

    expect(() => playTeachingSceneInputSchema.parse(scene)).not.toThrow();
    expect(scene.id).toBe(ARRAY_MAP_SCENE_ID);
    expect(scene.beats).toHaveLength(3);
    expect(scene.beats[0]).toEqual(
      expect.objectContaining({
        prepare: expect.objectContaining({
          surfaceId: "editor",
          filePath: "script.js",
        }),
        target: MAP_TARGET,
        guide: expect.objectContaining({ title: "Transform every item with map" }),
      }),
    );
    expect(scene.beats[1]).toEqual(
      expect.objectContaining({
        prepare: expect.objectContaining({ surfaceId: "console" }),
        target: expect.objectContaining({ resolverId: "target.surface-anchor" }),
        wait: {
          kind: "validation",
          criterionId: ARRAY_MAP_DEMO_IDS.outputCriterion,
          timeoutMs: 300_000,
        },
      }),
    );
    expect(scene.beats[2]?.assistant?.stateId).toBe("assistant.success");
    expect(JSON.stringify(scene)).not.toMatch(
      /cssSelector|rawSelector|xpath|domPath|coordinates|voice|audio|speech|ssml/iu,
    );
  });

  it("replaces the lesson, resolves map, validates source, runs, and starts the scene", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(successfulResult({ lessonId: ARRAY_MAP_DEMO_IDS.lesson }))
      .mockResolvedValueOnce(
        successfulResult({
          anchors: [
            {
              targets: [{ representation: "editor", target: MAP_TARGET }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(successfulResult({ passed: true }))
      .mockResolvedValueOnce(successfulResult({ accepted: true }))
      .mockResolvedValueOnce(
        successfulResult({ sceneId: ARRAY_MAP_SCENE_ID }, "started"),
      );

    const run = await runArrayMapDemoStage({ invoke });

    expect(run.accepted).toBe(true);
    expect(run.invocations.map(({ toolName }) => toolName)).toEqual([
      "create_guided_lesson",
      "inspect_classroom",
      "evaluate_current_step",
      "execute_environment_action",
      "play_teaching_scene",
    ]);
    expect(invoke).toHaveBeenNthCalledWith(
      1,
      "create_guided_lesson",
      expect.objectContaining({
        replaceExisting: true,
        environment: expect.objectContaining({
          profileId: "profile.javascript-console",
          activeSurfaceId: "console",
        }),
        files: [expect.objectContaining({ path: "script.js" })],
      }),
    );
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      "inspect_classroom",
      expect.objectContaining({
        anchorQuery: expect.objectContaining({
          resolverId: "locator.javascript.call",
        }),
      }),
    );
    expect(invoke).toHaveBeenNthCalledWith(
      4,
      "execute_environment_action",
      { actionId: "runtime.run", waitForCompletion: true },
    );
    expect(invoke).toHaveBeenLastCalledWith(
      "play_teaching_scene",
      expect.objectContaining({ id: ARRAY_MAP_SCENE_ID }),
    );
  });

  it("stops before runtime execution when source validation fails", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(successfulResult({ lessonId: ARRAY_MAP_DEMO_IDS.lesson }))
      .mockResolvedValueOnce(
        successfulResult({
          anchors: [
            {
              targets: [{ representation: "editor", target: MAP_TARGET }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(successfulResult({ passed: false }));

    const run = await runArrayMapDemoStage({ invoke });

    expect(run.accepted).toBe(false);
    expect(run.error).toContain("source validation did not pass");
    expect(invoke).toHaveBeenCalledTimes(3);
  });
});

function successfulResult(
  data: unknown,
  status: ToolResult<unknown>["status"] = "completed",
): ToolResult<unknown> {
  return {
    ok: true,
    operationId: `operation.${status}`,
    status,
    data,
  };
}

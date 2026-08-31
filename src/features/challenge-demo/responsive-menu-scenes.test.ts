import { describe, expect, it, vi } from "vitest";

import type { ToolResult } from "@/core/webmcp";
import {
  playTeachingSceneInputSchema,
} from "@/core/webmcp";

import {
  createResponsiveMenuCompletionScene,
  createResponsiveMenuCssScene,
  createResponsiveMenuHtmlScene,
  createResponsiveMenuJavascriptScene,
  createResponsiveMenuWarningScene,
  RESPONSIVE_MENU_SCENE_IDS,
} from "./responsive-menu-scenes";
import {
  runResponsiveMenuDemoStage,
} from "./responsive-menu-stage-runner";

const HTML_TARGET = {
  resolverId: "target.code-range",
  input: {
    filePath: "index.html",
    startLine: 20,
    startColumn: 7,
    endLine: 27,
    endColumn: 13,
  },
} as const;

describe("responsive menu HTML scene", () => {
  it("preserves structured guidance, companion pointing, a contextual hint, and a local wait", () => {
    const scene = createResponsiveMenuHtmlScene(HTML_TARGET);

    expect(() => playTeachingSceneInputSchema.parse(scene)).not.toThrow();
    expect(scene.id).toBe(RESPONSIVE_MENU_SCENE_IDS.html);
    expect(scene.beats).toHaveLength(3);
    expect(scene.beats[1]).toEqual(
      expect.objectContaining({
        target: HTML_TARGET,
        assistant: expect.objectContaining({
          stateId: "assistant.pointing",
          placementId: "placement.near-target",
        }),
        effects: expect.arrayContaining([
          expect.objectContaining({
            effectId: "effect.callout",
            input: expect.objectContaining({ text: expect.stringContaining("Hint:") }),
          }),
        ]),
        guide: expect.objectContaining({
          title: "Inspect the navigation landmark",
          supportingItems: [
            "The target was resolved from an HTML locator",
            "No raw selector or DOM path entered the scene",
          ],
        }),
      }),
    );
    expect(scene.beats[2]).toEqual(
      expect.objectContaining({
        wait: {
          kind: "interaction",
          eventTypeId: "interaction.preview-click",
          target: expect.objectContaining({ resolverId: "target.preview-anchor" }),
          timeoutMs: 300_000,
        },
      }),
    );
    expect(JSON.stringify(scene)).not.toMatch(
      /cssSelector|rawSelector|xpath|domPath|coordinates|voice|audio|speech|ssml/iu,
    );
  });

  it("resolves the editor target before invoking the production scene tool", async () => {
    const inspectResult = successfulResult({
      anchors: [
        {
          targets: [
            { representation: "preview", target: { resolverId: "target.preview-anchor", input: { anchorId: "source.preview" } } },
            { representation: "editor", target: HTML_TARGET },
          ],
        },
      ],
    });
    const sceneResult = successfulResult({ sceneId: RESPONSIVE_MENU_SCENE_IDS.html }, "started");
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(inspectResult)
      .mockResolvedValueOnce(sceneResult);

    const run = await runResponsiveMenuDemoStage({ invoke }, "html");

    expect(run.accepted).toBe(true);
    expect(invoke).toHaveBeenNthCalledWith(
      1,
      "inspect_classroom",
      expect.objectContaining({ include: ["anchors"] }),
    );
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      "play_teaching_scene",
      expect.objectContaining({
        id: RESPONSIVE_MENU_SCENE_IDS.html,
        beats: expect.arrayContaining([
          expect.objectContaining({ target: HTML_TARGET }),
        ]),
      }),
    );
    expect(run.invocations.map(({ toolName }) => toolName)).toEqual([
      "inspect_classroom",
      "play_teaching_scene",
    ]);
  });
});

describe("responsive menu CSS and mobile scene", () => {
  const cssTarget = {
    resolverId: "target.code-range",
    input: {
      filePath: "styles.css",
      startLine: 84,
      startColumn: 1,
      endLine: 108,
      endColumn: 2,
    },
  } as const;

  it("moves from the provider-resolved breakpoint into the registered mobile target", () => {
    const scene = createResponsiveMenuCssScene(cssTarget);

    expect(() => playTeachingSceneInputSchema.parse(scene)).not.toThrow();
    expect(scene.id).toBe(RESPONSIVE_MENU_SCENE_IDS.css);
    expect(scene.beats).toHaveLength(2);
    expect(scene.beats[0]).toEqual(
      expect.objectContaining({
        prepare: expect.objectContaining({
          surfaceId: "editor",
          filePath: "styles.css",
        }),
        target: cssTarget,
      }),
    );
    expect(scene.beats[1]).toEqual(
      expect.objectContaining({
        prepare: expect.objectContaining({
          surfaceId: "preview",
          viewportId: "mobile",
        }),
        target: expect.objectContaining({
          resolverId: "target.preview-anchor",
        }),
        assistant: expect.objectContaining({
          stateId: "assistant.pointing",
          placementId: "placement.near-target",
        }),
        guide: expect.objectContaining({
          supportingItems: [
            "Responsive geometry is observed",
            "Collision-safe placement keeps the control clear",
          ],
        }),
      }),
    );
  });

  it("resolves the CSS media query before invoking the mobile scene", async () => {
    const inspectResult = successfulResult({
      anchors: [
        {
          targets: [{ representation: "editor", target: cssTarget }],
        },
      ],
    });
    const sceneResult = successfulResult(
      { sceneId: RESPONSIVE_MENU_SCENE_IDS.css },
      "started",
    );
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(inspectResult)
      .mockResolvedValueOnce(sceneResult);

    const run = await runResponsiveMenuDemoStage({ invoke }, "css");

    expect(run.accepted).toBe(true);
    expect(invoke).toHaveBeenNthCalledWith(
      1,
      "inspect_classroom",
      expect.objectContaining({
        anchorQuery: expect.objectContaining({
          resolverId: "locator.css.media-query",
        }),
      }),
    );
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      "play_teaching_scene",
      expect.objectContaining({
        id: RESPONSIVE_MENU_SCENE_IDS.css,
        beats: expect.arrayContaining([
          expect.objectContaining({
            prepare: expect.objectContaining({ viewportId: "mobile" }),
          }),
        ]),
      }),
    );
  });
});

describe("responsive menu JavaScript scene", () => {
  const javascriptTarget = {
    resolverId: "target.code-range",
    input: {
      filePath: "script.js",
      startLine: 4,
      startColumn: 1,
      endLine: 8,
      endColumn: 3,
    },
  } as const;

  it("moves from the semantic listener to a normalized preview interaction wait", () => {
    const scene = createResponsiveMenuJavascriptScene(javascriptTarget);

    expect(() => playTeachingSceneInputSchema.parse(scene)).not.toThrow();
    expect(scene.id).toBe(RESPONSIVE_MENU_SCENE_IDS.javascript);
    expect(scene.beats).toHaveLength(2);
    expect(scene.beats[0]).toEqual(
      expect.objectContaining({
        prepare: expect.objectContaining({
          surfaceId: "editor",
          filePath: "script.js",
        }),
        target: javascriptTarget,
        guide: expect.objectContaining({
          supportingItems: [
            "The source target comes from the JavaScript provider",
            "Accessible and visual state share one boolean",
          ],
        }),
      }),
    );
    expect(scene.beats[1]).toEqual(
      expect.objectContaining({
        prepare: expect.objectContaining({
          surfaceId: "preview",
          viewportId: "mobile",
        }),
        target: expect.objectContaining({ resolverId: "target.preview-anchor" }),
        wait: {
          kind: "interaction",
          eventTypeId: "interaction.preview-click",
          target: expect.objectContaining({ resolverId: "target.preview-anchor" }),
          timeoutMs: 300_000,
        },
      }),
    );
    expect(JSON.stringify(scene)).not.toMatch(
      /cssSelector|rawSelector|xpath|domPath|coordinates|voice|audio|speech|ssml/iu,
    );
  });

  it("resolves the JavaScript event listener before invoking the scene", async () => {
    const inspectResult = successfulResult({
      anchors: [
        {
          targets: [{ representation: "editor", target: javascriptTarget }],
        },
      ],
    });
    const sceneResult = successfulResult(
      { sceneId: RESPONSIVE_MENU_SCENE_IDS.javascript },
      "started",
    );
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(inspectResult)
      .mockResolvedValueOnce(sceneResult);

    const run = await runResponsiveMenuDemoStage({ invoke }, "javascript");

    expect(run.accepted).toBe(true);
    expect(invoke).toHaveBeenNthCalledWith(
      1,
      "inspect_classroom",
      expect.objectContaining({
        anchorQuery: expect.objectContaining({
          resolverId: "locator.javascript.event-listener",
          input: expect.objectContaining({ targetName: "menuToggle" }),
        }),
      }),
    );
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      "play_teaching_scene",
      expect.objectContaining({
        id: RESPONSIVE_MENU_SCENE_IDS.javascript,
        beats: expect.arrayContaining([
          expect.objectContaining({ target: javascriptTarget }),
          expect.objectContaining({
            wait: expect.objectContaining({
              eventTypeId: "interaction.preview-click",
            }),
          }),
        ]),
      }),
    );
  });
});

describe("responsive menu reaction scenes", () => {
  it("uses success as a celebration and returns the assistant to an idle close", () => {
    const scene = createResponsiveMenuCompletionScene();

    expect(() => playTeachingSceneInputSchema.parse(scene)).not.toThrow();
    expect(scene.id).toBe(RESPONSIVE_MENU_SCENE_IDS.completion);
    expect(scene.beats.map(({ assistant }) => assistant?.stateId)).toEqual([
      "assistant.success",
      "assistant.idle",
    ]);
    expect(scene.beats[0]).toEqual(
      expect.objectContaining({
        target: expect.objectContaining({ resolverId: "target.preview-anchor" }),
        guide: expect.objectContaining({
          title: "Celebrate verified behavior",
          supportingItems: [
            "Every declared criterion passed",
            "The learner interaction was observed locally",
          ],
        }),
      }),
    );
    expect(scene.beats[1]).toEqual(
      expect.objectContaining({
        target: expect.objectContaining({ resolverId: "target.surface-anchor" }),
        guide: expect.objectContaining({ title: "Return to the completed plan" }),
      }),
    );
  });

  it("provides a replayable warning fixture without a wait or learner mutation", () => {
    const scene = createResponsiveMenuWarningScene();

    expect(() => playTeachingSceneInputSchema.parse(scene)).not.toThrow();
    expect(scene.id).toBe(RESPONSIVE_MENU_SCENE_IDS.warning);
    expect(scene.beats).toHaveLength(1);
    expect(scene.beats[0]).toEqual(
      expect.objectContaining({
        assistant: expect.objectContaining({ stateId: "assistant.warning" }),
        guide: expect.objectContaining({
          title: "Preview bounded warning feedback",
        }),
      }),
    );
    expect(scene.beats[0]?.wait).toBeUndefined();
    expect(JSON.stringify(scene)).not.toMatch(/voice|audio|speech|ssml/iu);
  });

  it("evaluates every responsive-menu step before starting the completion scene", async () => {
    const invoke = vi.fn();
    for (let index = 0; index < 5; index += 1) {
      invoke.mockResolvedValueOnce(successfulResult({ passed: true }));
    }
    invoke.mockResolvedValueOnce(
      successfulResult(
        { sceneId: RESPONSIVE_MENU_SCENE_IDS.completion },
        "started",
      ),
    );

    const run = await runResponsiveMenuDemoStage({ invoke }, "complete");

    expect(run.accepted).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(6);
    expect(
      invoke.mock.calls.slice(0, 5).map(([toolName]) => toolName),
    ).toEqual(Array.from({ length: 5 }, () => "evaluate_current_step"));
    expect(invoke).toHaveBeenLastCalledWith(
      "play_teaching_scene",
      expect.objectContaining({ id: RESPONSIVE_MENU_SCENE_IDS.completion }),
    );
  });

  it("starts warning guidance when a completion validation does not pass", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(successfulResult({ passed: false }))
      .mockResolvedValueOnce(
        successfulResult(
          { sceneId: RESPONSIVE_MENU_SCENE_IDS.warning },
          "started",
        ),
      );

    const run = await runResponsiveMenuDemoStage({ invoke }, "complete");

    expect(run.accepted).toBe(false);
    expect(run.error).toContain("validation did not pass");
    expect(invoke).toHaveBeenLastCalledWith(
      "play_teaching_scene",
      expect.objectContaining({ id: RESPONSIVE_MENU_SCENE_IDS.warning }),
    );
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

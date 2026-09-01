import type { PlayTeachingSceneInput, TargetRefInput } from "@/core/webmcp";

import {
  ARRAY_MAP_DEMO_IDS,
  ARRAY_MAP_TARGET_CATALOG,
} from "./array-map-fixture";

export const ARRAY_MAP_SCENE_ID = "scene.array-map-console";

export function createArrayMapScene(
  mapCallTarget: TargetRefInput,
): PlayTeachingSceneInput {
  const consoleTarget = ARRAY_MAP_TARGET_CATALOG.console.target;
  return {
    id: ARRAY_MAP_SCENE_ID,
    title: "Array.map() source and console evidence",
    cleanupPolicy: "replace",
    allowManualNavigation: true,
    beats: [
      {
        id: "beat.array-map-source",
        lessonStepId: ARRAY_MAP_DEMO_IDS.mapStep,
        type: "explanation",
        prepare: {
          surfaceId: "editor",
          filePath: "script.js",
          scroll: "if-needed",
        },
        target: mapCallTarget,
        assistant: {
          stateId: "assistant.pointing",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [
          { effectId: "effect.focus" },
          { effectId: "effect.highlight" },
          { effectId: "effect.pointer" },
          {
            effectId: "effect.callout",
            input: {
              text: "Read the callback as a one-to-one transformation from each score to its scaled value.",
            },
          },
        ],
        guide: {
          title: "Transform every item with map",
          body: "The JavaScript provider resolved the scores.map() call as a semantic source target. The callback returns a new value while leaving the source array unchanged.",
          supportingItems: [
            "One input produces one output",
            "The source order is preserved",
          ],
        },
        caption: "The highlighted call comes from a registered JavaScript locator.",
      },
      {
        id: "beat.array-map-console-wait",
        lessonStepId: ARRAY_MAP_DEMO_IDS.outputStep,
        type: "validation",
        prepare: {
          surfaceId: "console",
          scroll: "if-needed",
        },
        target: consoleTarget,
        assistant: {
          stateId: "assistant.thinking",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [
          { effectId: "effect.focus" },
          { effectId: "effect.spotlight" },
        ],
        guide: {
          title: "Read the validated console output",
          body: "The console validator waits locally for the expected transformed values. Runtime evidence, not an additional agent request, decides when this beat succeeds.",
          supportingItems: [
            "Expected output: 6, 10, 16",
            "Runtime errors must remain absent",
          ],
        },
        caption: "The JavaScript Console surface is the primary evidence surface.",
        wait: {
          kind: "validation",
          criterionId: ARRAY_MAP_DEMO_IDS.outputCriterion,
          timeoutMs: 300_000,
        },
      },
      {
        id: "beat.array-map-success",
        lessonStepId: ARRAY_MAP_DEMO_IDS.outputStep,
        type: "feedback",
        prepare: {
          surfaceId: "console",
          scroll: "if-needed",
        },
        target: consoleTarget,
        assistant: {
          stateId: "assistant.success",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [{ effectId: "effect.focus" }],
        guide: {
          title: "Keep the validated result",
          body: "The transformed output matched and the JavaScript-only lesson remains available with its code, console evidence, and plan history intact.",
          supportingItems: [
            "The output criterion passed locally",
            "The profile changed without a page reload",
          ],
        },
        caption: "The secondary demo closes with evidence-backed success.",
      },
    ],
  };
}

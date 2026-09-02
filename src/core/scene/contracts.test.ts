import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  SceneInteractionEvent,
  SceneSnapshot,
  TeachingScene,
} from "./contracts";

describe("scene contracts", () => {
  it("accepts provider-declared target, effect, assistant, placement, wait, and interaction IDs", () => {
    const scene = {
      id: "scene.fake",
      cleanupPolicy: "replace",
      allowManualNavigation: true,
      beats: [
        {
          id: "beat.fake",
          prepare: {
            surfaceId: "surface.fake",
            filePath: "lesson.fake",
            viewportId: "viewport.fake",
            scroll: "if-needed",
          },
          target: {
            resolverId: "target.fake",
            input: { anchorId: "anchor.fake" },
          },
          targetLossRecovery: "retry",
          assistant: {
            stateId: "assistant.fake-explaining",
            placementId: "placement.fake-near-target",
            visible: true,
          },
          effects: [
            {
              effectId: "effect.fake-highlight",
              input: { emphasis: "strong" },
            },
          ],
          guide: {
            title: "Fake provider guidance",
            body: "Use the declared semantic target.",
            supportingItems: ["No raw selector is required."],
          },
          caption: "Provider-neutral scene caption.",
          wait: {
            kind: "interaction",
            eventTypeId: "interaction.fake-activate",
            target: {
              resolverId: "target.fake",
              input: { anchorId: "anchor.fake" },
            },
            timeoutMs: 30_000,
          },
        },
      ],
    } satisfies TeachingScene;

    expect(scene.beats[0]?.target.resolverId).toBe("target.fake");
    expect(scene.beats[0]?.assistant.stateId).toBe("assistant.fake-explaining");
    expect(scene.beats[0]?.wait.eventTypeId).toBe("interaction.fake-activate");
  });

  it("shares the normalized interaction and semantic target boundary", () => {
    expectTypeOf<SceneInteractionEvent>().toHaveProperty("typeId");
    expectTypeOf<SceneInteractionEvent>().toHaveProperty("targetRef");
    expectTypeOf<SceneSnapshot>().toHaveProperty("assistant");
    expectTypeOf<SceneSnapshot>().not.toHaveProperty("geometry");
    expectTypeOf<TeachingScene>().not.toHaveProperty("voice");
    expectTypeOf<TeachingScene>().not.toHaveProperty("audio");
  });
});

import { describe, expect, it } from "vitest";

import { DEFAULT_SYSTEM_LIMITS } from "@/core/platform/contracts";

import {
  createGuidedLessonInputSchema,
  getWebMCPToolJsonSchema,
  playTeachingSceneInputSchema,
  WEBMCP_TOOL_INPUT_SCHEMAS,
} from "./schemas";
import { WEBMCP_TOOL_NAMES } from "./tool-names";

describe("WebMCP tool schemas", () => {
  it("defines every P0 tool as a closed JSON object schema", () => {
    expect(Object.keys(WEBMCP_TOOL_INPUT_SCHEMAS)).toEqual(WEBMCP_TOOL_NAMES);

    WEBMCP_TOOL_NAMES.forEach((name) => {
      expect(getWebMCPToolJsonSchema(name)).toEqual(
        expect.objectContaining({
          type: "object",
          additionalProperties: false,
        }),
      );
    });
  });

  it("accepts provider-neutral IDs without hardcoded language unions", () => {
    const result = createGuidedLessonInputSchema.safeParse({
      lessonId: "lesson.fixture",
      title: "Fixture lesson",
      objective: "Exercise a future provider.",
      environment: {
        profileId: "profile.future",
        runtimeProviderId: "runtime.future",
        languageIds: ["language.future"],
      },
      files: [
        {
          path: "main.future",
          languageId: "language.future",
          content: "future source",
        },
      ],
      steps: [
        {
          id: "step.fixture",
          title: "Fixture step",
          objective: "Use a registered future validator.",
          criteria: [
            {
              id: "criterion.fixture",
              validatorId: "validator.future",
              input: { expected: true },
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it.each(["voice", "audio", "narration", "speech", "ssml", "mediaUrl", "playback"])(
    "rejects unsupported %s scene fields without changing visual guide content",
    (field) => {
      const scene = {
        id: "scene.fixture",
        beats: [
          {
            id: "beat.fixture",
            guide: {
              title: "Keep this title",
              body: "Keep this visual explanation.",
              supportingItems: ["First", "Second"],
            },
            [field]: "unsupported",
          },
        ],
      };

      expect(playTeachingSceneInputSchema.safeParse(scene).success).toBe(false);
      delete scene.beats[0][field as keyof (typeof scene.beats)[number]];
      expect(playTeachingSceneInputSchema.parse(scene).beats[0]?.guide).toEqual({
        title: "Keep this title",
        body: "Keep this visual explanation.",
        supportingItems: ["First", "Second"],
      });
    },
  );

  it("rejects unsafe semantic target locators and unknown nested properties", () => {
    expect(() =>
      playTeachingSceneInputSchema.parse({
        id: "scene.fixture",
        beats: [
          {
            id: "beat.fixture",
            target: {
              resolverId: "target.fixture",
              input: { cssSelector: "#unsafe" },
            },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      playTeachingSceneInputSchema.parse({
        id: "scene.fixture",
        beats: [{ id: "beat.fixture", unknown: true }],
      }),
    ).toThrow();
  });

  it("enforces visual guidance and scene limits", () => {
    expect(() =>
      playTeachingSceneInputSchema.parse({
        id: "scene.fixture",
        beats: Array.from(
          { length: DEFAULT_SYSTEM_LIMITS.maxSceneBeats + 1 },
          (_, index) => ({ id: `beat.${index}` }),
        ),
      }),
    ).toThrow();
    expect(() =>
      playTeachingSceneInputSchema.parse({
        id: "scene.fixture",
        beats: [
          {
            id: "beat.fixture",
            guide: {
              body: "x".repeat(DEFAULT_SYSTEM_LIMITS.maxVisualGuideBodyCharacters + 1),
            },
          },
        ],
      }),
    ).toThrow();
  });
});

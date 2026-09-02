import { describe, expect, it } from "vitest";

import { DEFAULT_SYSTEM_LIMITS } from "@/core/platform/contracts";
import { createP0ProviderPlatform } from "@/providers/p0";

import {
  createGuidedLessonInputSchema,
  getWebMCPToolJsonSchema,
  inspectClassroomInputSchema,
  playTeachingSceneInputSchema,
  setGuideBuildStatusInputSchema,
  WEBMCP_TOOL_INPUT_SCHEMAS,
} from "./schemas";
import { WEBMCP_TOOL_NAMES } from "./tool-names";

type JsonSchemaNode = {
  description?: string;
  items?: JsonSchemaNode;
  properties?: Record<string, JsonSchemaNode>;
};

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
      lessonMode: "explain",
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

  it("requires the matching fields for each guide build status", () => {
    expect(
      setGuideBuildStatusInputSchema.safeParse({
        status: "building",
        stage: "understanding-goal",
      }).success,
    ).toBe(true);
    expect(
      setGuideBuildStatusInputSchema.safeParse({ status: "building" }).success,
    ).toBe(false);
    expect(
      setGuideBuildStatusInputSchema.safeParse({
        status: "error",
        message: "The lesson could not be prepared.",
      }).success,
    ).toBe(true);
    expect(
      setGuideBuildStatusInputSchema.safeParse({ status: "error" }).success,
    ).toBe(false);
    expect(
      setGuideBuildStatusInputSchema.safeParse({
        status: "completed",
        stage: "setting-up-classroom",
      }).success,
    ).toBe(false);
  });

  it("requires explicit lesson and beat intent in the public JSON schemas", () => {
    const lessonSchema = getWebMCPToolJsonSchema("create_guided_lesson");
    const sceneSchema = getWebMCPToolJsonSchema("play_teaching_scene");
    const lessonProperties = lessonSchema.properties as Record<
      string,
      Record<string, unknown>
    >;
    const sceneProperties = sceneSchema.properties as Record<
      string,
      Record<string, unknown>
    >;
    const beatSchema = (
      (sceneProperties.beats.items as Record<string, unknown>).properties as Record<
        string,
        Record<string, unknown>
      >
    );

    expect(lessonSchema.required).toContain("lessonMode");
    expect(lessonProperties.lessonMode.description).toContain("complete examples");
    expect(
      createGuidedLessonInputSchema.safeParse({
        ...createValidLessonInput(),
        lessonMode: undefined,
      }).success,
    ).toBe(false);
    expect((sceneProperties.beats.items as { required?: string[] }).required).toContain(
      "type",
    );
    expect(beatSchema.type.description).toContain("one small concept");
    expect(
      playTeachingSceneInputSchema.safeParse({
        id: "scene.missing-intent",
        beats: [{ id: "beat.missing-intent" }],
      }).success,
    ).toBe(false);
  });

  it("describes inline code syntax on every guide-authoring field", () => {
    const lessonSchema = getWebMCPToolJsonSchema("create_guided_lesson");
    const sceneSchema = getWebMCPToolJsonSchema("play_teaching_scene");
    const lessonProperties = lessonSchema.properties as Record<string, JsonSchemaNode>;
    const sceneProperties = sceneSchema.properties as Record<string, JsonSchemaNode>;
    const sceneBeatProperties = getBeatProperties(sceneProperties);
    const initialSceneProperties = lessonProperties.initialScene.properties ?? {};
    const initialBeatProperties = getBeatProperties(initialSceneProperties);
    const lessonStepProperties = lessonProperties.steps.items?.properties ?? {};

    for (const beatProperties of [sceneBeatProperties, initialBeatProperties]) {
      const guideProperties = beatProperties.guide.properties ?? {};
      expect(guideProperties.title.description).toContain("single backticks");
      expect(guideProperties.body.description).toContain("single backticks");
      expect(guideProperties.supportingItems.items?.description).toContain(
        "single backticks",
      );
      expect(beatProperties.caption.description).toContain("single backticks");
    }

    expect(lessonStepProperties.hints.items?.description).toContain(
      "single backticks",
    );
    const calloutSchema = createP0ProviderPlatform().guidance.effects.require(
      "effect.callout",
    ).inputSchema;
    expect(calloutSchema.properties.text?.description).toContain("single backticks");
  });

  it.each(["voice", "audio", "narration", "speech", "ssml", "mediaUrl", "playback"])(
    "rejects unsupported %s scene fields without changing visual guide content",
    (field) => {
      const scene = {
        id: "scene.fixture",
        beats: [
          {
            id: "beat.fixture",
            type: "explanation",
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
    [
      { selector: "button" },
      { cssSelector: "#unsafe" },
      { xpath: "//button" },
      { domPath: "body/button[1]" },
      { coordinates: [10, 20] },
      { nested: { pixelX: 10, pixelY: 20 } },
    ].forEach((input) => {
      expect(() =>
        playTeachingSceneInputSchema.parse({
          id: "scene.fixture",
          beats: [
            {
              id: "beat.fixture",
              type: "explanation",
              target: {
                resolverId: "target.fixture",
                input,
              },
            },
          ],
        }),
      ).toThrow();
    });
    expect(() =>
      playTeachingSceneInputSchema.parse({
        id: "scene.fixture",
        beats: [{ id: "beat.fixture", type: "explanation", unknown: true }],
      }),
    ).toThrow();
  });

  it("enforces visual guidance and scene limits", () => {
    expect(
      playTeachingSceneInputSchema.safeParse({
        id: "scene.fixture",
        beats: Array.from(
          { length: DEFAULT_SYSTEM_LIMITS.maxSceneBeats },
          (_, index) => ({ id: `beat.${index}`, type: "explanation" }),
        ),
      }).success,
    ).toBe(true);
    expect(() =>
      playTeachingSceneInputSchema.parse({
        id: "scene.fixture",
        beats: Array.from(
          { length: DEFAULT_SYSTEM_LIMITS.maxSceneBeats + 1 },
          (_, index) => ({ id: `beat.${index}`, type: "explanation" }),
        ),
      }),
    ).toThrow();
    expect(() =>
      playTeachingSceneInputSchema.parse({
        id: "scene.fixture",
        beats: [
          {
            id: "beat.fixture",
            type: "explanation",
            guide: {
              body: "x".repeat(DEFAULT_SYSTEM_LIMITS.maxVisualGuideBodyCharacters + 1),
            },
          },
        ],
      }),
    ).toThrow();
    expect(
      playTeachingSceneInputSchema.safeParse({
        id: "scene.fixture",
        beats: [
          {
            id: "beat.fixture",
            type: "explanation",
            guide: {
              body: "x".repeat(DEFAULT_SYSTEM_LIMITS.maxVisualGuideBodyCharacters),
              supportingItems: Array.from(
                { length: DEFAULT_SYSTEM_LIMITS.maxVisualGuideItems },
                () => "x".repeat(DEFAULT_SYSTEM_LIMITS.maxVisualGuideItemCharacters),
              ),
            },
            caption: "x".repeat(DEFAULT_SYSTEM_LIMITS.maxCaptionCharacters),
          },
        ],
      }).success,
    ).toBe(true);
    expect(() =>
      playTeachingSceneInputSchema.parse({
        id: "scene.fixture",
        beats: [
          {
            id: "beat.fixture",
            type: "explanation",
            guide: {
              body: "Visible guidance",
              supportingItems: Array.from(
                { length: DEFAULT_SYSTEM_LIMITS.maxVisualGuideItems + 1 },
                (_, index) => `Item ${index}`,
              ),
            },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      playTeachingSceneInputSchema.parse({
        id: "scene.fixture",
        beats: [
          {
            id: "beat.fixture",
            type: "explanation",
            guide: {
              body: "Visible guidance",
              supportingItems: [
                "x".repeat(DEFAULT_SYSTEM_LIMITS.maxVisualGuideItemCharacters + 1),
              ],
            },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      playTeachingSceneInputSchema.parse({
        id: "scene.fixture",
        beats: [
          {
            id: "beat.fixture",
            type: "explanation",
            caption: "x".repeat(DEFAULT_SYSTEM_LIMITS.maxCaptionCharacters + 1),
          },
        ],
      }),
    ).toThrow();
  });

  it("accepts a nine-beat scene mapped to five Learning Plan sections", () => {
    const ranges = [
      [1, 1, 1, 39, "step.variables", "Variables overview"],
      [2, 1, 4, 43, "step.variables", "Variables in detail"],
      [5, 1, 7, 2, "step.functions", "Function declaration"],
      [6, 3, 6, 29, "step.functions", "Function return"],
      [8, 1, 8, 73, "step.arrows", "Arrow function"],
      [9, 1, 9, 40, "step.arrows", "Implicit return"],
      [10, 1, 13, 3, "step.objects", "Object literal"],
      [11, 3, 12, 22, "step.objects", "Object properties"],
      [14, 1, 14, 78, "step.together", "Everything together"],
    ] as const;
    const result = playTeachingSceneInputSchema.safeParse({
      id: "scene.guidance-synchronization",
      cleanupPolicy: "replace",
      allowManualNavigation: true,
      beats: ranges.map((range, index) => ({
        id: `beat.guidance-${index + 1}`,
        lessonStepId: range[4],
        type: "explanation",
        prepare: {
          surfaceId: "editor",
          filePath: "index.js",
          scroll: "if-needed",
        },
        target: {
          resolverId: "target.code-range",
          input: {
            filePath: "index.js",
            startLine: range[0],
            startColumn: range[1],
            endLine: range[2],
            endColumn: range[3],
          },
        },
        assistant: {
          stateId: "assistant.pointing",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [{ effectId: "effect.highlight" }],
        guide: {
          title: range[5],
          body: `Guide micro-step ${index + 1} remains separate from the Learning Plan section count.`,
        },
      })),
    });

    expect(result.success).toBe(true);
  });

  it("enforces file, lesson-step, file-byte, and inspection-retention limits", () => {
    const lesson = createValidLessonInput();

    expect(
      createGuidedLessonInputSchema.safeParse({
        ...lesson,
        files: Array.from({ length: DEFAULT_SYSTEM_LIMITS.maxFiles }, (_, index) => ({
          path: `file-${index}.js`,
          languageId: "language.javascript",
          content: "",
        })),
        steps: Array.from(
          { length: DEFAULT_SYSTEM_LIMITS.maxLessonSteps },
          (_, index) => ({
            id: `step.${index}`,
            title: `Step ${index}`,
            objective: "Stay within the declared lesson limit.",
          }),
        ),
      }).success,
    ).toBe(true);
    expect(
      createGuidedLessonInputSchema.safeParse({
        ...lesson,
        files: Array.from(
          { length: DEFAULT_SYSTEM_LIMITS.maxFiles + 1 },
          (_, index) => ({
            path: `file-${index}.js`,
            languageId: "language.javascript",
            content: "",
          }),
        ),
      }).success,
    ).toBe(false);
    expect(
      createGuidedLessonInputSchema.safeParse({
        ...lesson,
        files: [
          {
            path: "script.js",
            languageId: "language.javascript",
            content: "é".repeat(DEFAULT_SYSTEM_LIMITS.maxFileBytes / 2 + 1),
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      createGuidedLessonInputSchema.safeParse({
        ...lesson,
        steps: Array.from(
          { length: DEFAULT_SYSTEM_LIMITS.maxLessonSteps + 1 },
          (_, index) => ({
            id: `step.${index}`,
            title: `Step ${index}`,
            objective: "Exceed the declared lesson limit.",
          }),
        ),
      }).success,
    ).toBe(false);
    expect(
      inspectClassroomInputSchema.safeParse({
        maxActivity: DEFAULT_SYSTEM_LIMITS.maxActivityEvents,
      }).success,
    ).toBe(true);
    expect(
      inspectClassroomInputSchema.safeParse({
        maxActivity: DEFAULT_SYSTEM_LIMITS.maxActivityEvents + 1,
      }).success,
    ).toBe(false);
  });
});

function createValidLessonInput() {
  return {
    lessonId: "lesson.fixture",
    lessonMode: "practice",
    title: "Fixture lesson",
    objective: "Verify the declared system limits.",
    environment: {
      profileId: "profile.javascript-console",
      runtimeProviderId: "runtime.sandpack-vanilla",
      languageIds: ["language.javascript"],
    },
    files: [
      {
        path: "script.js",
        languageId: "language.javascript",
        content: "",
      },
    ],
    steps: [
      {
        id: "step.fixture",
        title: "Fixture step",
        objective: "Remain inside the declared limits.",
      },
    ],
  };
}

function getBeatProperties(
  sceneProperties: Record<string, JsonSchemaNode>,
): Record<string, JsonSchemaNode> {
  return sceneProperties.beats.items?.properties ?? {};
}

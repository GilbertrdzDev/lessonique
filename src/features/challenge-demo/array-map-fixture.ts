import type {
  CreateGuidedLessonInput,
  InspectClassroomInput,
  TargetRefInput,
} from "@/core/webmcp";

export const ARRAY_MAP_DEMO_IDS = {
  lesson: "lesson.array-map",
  mapStep: "step.array-map-transform",
  outputStep: "step.array-map-output",
  mapCriterion: "criterion.array-map-call",
  outputCriterion: "criterion.array-map-output",
  consoleCriterion: "criterion.array-map-console",
} as const;

type AnchorQuery = NonNullable<InspectClassroomInput["anchorQuery"]>;

export type ArrayMapTargetCatalogEntry =
  | Readonly<{
      id: string;
      kind: "source";
      query: AnchorQuery;
      representation: "editor" | "preview";
    }>
  | Readonly<{
      id: string;
      kind: "registered";
      target: TargetRefInput;
    }>;

export const ARRAY_MAP_TARGET_CATALOG = {
  mapCall: {
    id: "target.demo.array-map-call",
    kind: "source",
    representation: "editor",
    query: {
      resolverId: "locator.javascript.call",
      input: {
        filePath: "script.js",
        receiverName: "scores",
        calleeName: "map",
      },
    },
  },
  console: {
    id: "target.demo.array-map-console",
    kind: "registered",
    target: {
      resolverId: "target.surface-anchor",
      input: { anchorId: "anchor.workspace-console" },
    },
  },
} as const satisfies Record<string, ArrayMapTargetCatalogEntry>;

export function createArrayMapLessonFixture(): CreateGuidedLessonInput {
  return {
    lessonId: ARRAY_MAP_DEMO_IDS.lesson,
    title: "Transform scores with Array.map()",
    objective:
      "Create a new array without mutating the source values and verify the result in the JavaScript console.",
    description:
      "A JavaScript-only console lesson that replaces the previous class through provider-backed configuration and validation.",
    language: "en",
    replaceExisting: true,
    environment: {
      profileId: "profile.javascript-console",
      languageIds: ["language.javascript"],
      activeFile: "script.js",
      activeSurfaceId: "console",
    },
    files: [
      {
        path: "script.js",
        languageId: "language.javascript",
        content: ARRAY_MAP_JAVASCRIPT,
      },
    ],
    steps: [
      {
        id: ARRAY_MAP_DEMO_IDS.mapStep,
        title: "Transform every score",
        objective: "Use Array.map() to return one scaled value for every source value.",
        instructions:
          "Inspect the map callback and confirm that the original scores array remains unchanged.",
        criteria: [
          {
            id: ARRAY_MAP_DEMO_IDS.mapCriterion,
            validatorId: "validator.javascript-call-exists",
            input: {
              filePath: "script.js",
              receiverName: "scores",
              calleeName: "map",
            },
          },
        ],
        hints: [
          "Return the transformed value from the callback instead of modifying the source item.",
        ],
      },
      {
        id: ARRAY_MAP_DEMO_IDS.outputStep,
        title: "Verify the console output",
        objective: "Confirm the transformed values and a clean JavaScript runtime.",
        instructions:
          "Run the script and compare the console message with the expected scaled scores.",
        criteria: [
          {
            id: ARRAY_MAP_DEMO_IDS.outputCriterion,
            validatorId: "validator.console-output-matches",
            input: {
              text: "Scaled scores: 6, 10, 16",
              mode: "contains",
              kind: "log",
            },
          },
          {
            id: ARRAY_MAP_DEMO_IDS.consoleCriterion,
            validatorId: "validator.no-console-errors",
            input: {},
          },
        ],
        hints: [
          "The output should preserve the original order while doubling every value.",
        ],
      },
    ],
  };
}

const ARRAY_MAP_JAVASCRIPT = `const scores = [3, 5, 8];
const scaledScores = scores.map((score) => score * 2);

console.log(\`Scaled scores: \${scaledScores.join(", ")}\`);`;

export const ARRAY_MAP_LESSON_FIXTURE = createArrayMapLessonFixture();

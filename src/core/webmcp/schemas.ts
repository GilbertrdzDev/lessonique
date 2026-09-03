import { z } from "zod";

import { DEFAULT_SYSTEM_LIMITS } from "@/core/platform/contracts";
import type { JsonValue } from "@/core/platform/json-schema";
import { GUIDE_INLINE_CODE_SYNTAX_DESCRIPTION } from "@/core/platform/visual-guide";
import { GUIDE_BUILD_STAGE_IDS } from "@/core/guide-build";

import type { WebMCPToolName } from "./tool-names";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const FORBIDDEN_P0_KEYS = new Set([
  "audio",
  "audioresponse",
  "callback",
  "eval",
  "javascript",
  "mediaurl",
  "narration",
  "playback",
  "script",
  "shell",
  "shellcommand",
  "speech",
  "speechsynthesis",
  "ssml",
  "texttospeech",
  "tts",
  "voice",
  "voiceid",
  "webspeechapi",
]);
const FORBIDDEN_TARGET_KEYS = new Set([
  "absolutepixelcoordinate",
  "absolutepixelcoordinates",
  "coordinates",
  "cssselector",
  "dompath",
  "pixelcoordinate",
  "pixelcoordinates",
  "pixelx",
  "pixely",
  "rawselector",
  "selector",
  "xpath",
  "x",
  "y",
]);

const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(IDENTIFIER_PATTERN);
const workspacePathSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(isSafeWorkspacePath, "Path must stay inside the workspace.");
const fileContentSchema = z
  .string()
  .refine(
    (content) => new TextEncoder().encode(content).byteLength <= DEFAULT_SYSTEM_LIMITS.maxFileBytes,
    `File content must not exceed ${DEFAULT_SYSTEM_LIMITS.maxFileBytes} bytes.`,
  );

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
const providerInputSchema = z.record(z.string().min(1).max(128), jsonValueSchema);

const surfaceOptionSchema = z.strictObject({
  optionId: identifierSchema,
  value: z.union([z.string(), z.number().finite(), z.boolean()]),
});

export const surfaceConfigurationInputSchema = z.strictObject({
  id: identifierSchema,
  visible: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  placementId: identifierSchema.optional(),
  modeId: identifierSchema.optional(),
  size: z.number().finite().positive().optional(),
  options: z.array(surfaceOptionSchema).max(50).optional(),
});

export const targetRefSchema = z
  .strictObject({
    resolverId: identifierSchema,
    input: providerInputSchema,
  })
  .superRefine((target, context) => {
    addForbiddenKeyIssues(target.input, FORBIDDEN_TARGET_KEYS, context, ["input"]);
  });

const guidanceEffectSchema = z.strictObject({
  effectId: identifierSchema,
  input: providerInputSchema.optional(),
});

const visualGuideSchema = z.strictObject({
  title: z
    .string()
    .min(1)
    .max(120)
    .describe(GUIDE_INLINE_CODE_SYNTAX_DESCRIPTION)
    .optional(),
  body: z
    .string()
    .min(1)
    .max(DEFAULT_SYSTEM_LIMITS.maxVisualGuideBodyCharacters)
    .describe(
      `Keep this explanation focused on the active micro-step; do not combine multiple concepts into a wall of text. ${GUIDE_INLINE_CODE_SYNTAX_DESCRIPTION}`,
    ),
  supportingItems: z
    .array(
      z
        .string()
        .min(1)
        .max(DEFAULT_SYSTEM_LIMITS.maxVisualGuideItemCharacters)
        .describe(GUIDE_INLINE_CODE_SYNTAX_DESCRIPTION),
    )
    .max(DEFAULT_SYSTEM_LIMITS.maxVisualGuideItems)
    .describe(
      "Use for supporting details on explanation beats. Omit this field on the final coding-exercise beat because Lessonique derives its numbered requirements from the mapped criteria.",
    )
    .optional(),
});

const assistantPresentationSchema = z.strictObject({
  stateId: identifierSchema,
  placementId: identifierSchema.optional(),
  visible: z.boolean().optional(),
});

const waitConditionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("interaction"),
    eventTypeId: identifierSchema,
    target: targetRefSchema.optional(),
    timeoutMs: z.number().int().positive().max(300_000).optional(),
  }),
  z.strictObject({
    kind: z.literal("validation"),
    criterionId: identifierSchema,
    timeoutMs: z.number().int().positive().max(300_000).optional(),
  }),
]);

const teachingBeatSchema = z.strictObject({
  id: identifierSchema,
  lessonStepId: identifierSchema
    .describe("Reference the Learning Plan section taught by this micro-step. Reuse the same ID across consecutive beats in one section.")
    .optional(),
  type: z
    .enum(["explanation", "interaction", "validation", "feedback"])
    .describe("Use explanation for one small concept, interaction while the learner works, validation while checking declared criteria, and feedback for success or correction."),
  prepare: z
    .strictObject({
      surfaceId: identifierSchema.optional(),
      filePath: workspacePathSchema.optional(),
      viewportId: identifierSchema.optional(),
      scroll: z.enum(["none", "if-needed"]).optional(),
    })
    .optional(),
  target: targetRefSchema.optional(),
  assistant: assistantPresentationSchema.optional(),
  effects: z.array(guidanceEffectSchema).max(8).optional(),
  guide: visualGuideSchema.optional(),
  caption: z
    .string()
    .min(1)
    .max(DEFAULT_SYSTEM_LIMITS.maxCaptionCharacters)
    .describe(GUIDE_INLINE_CODE_SYNTAX_DESCRIPTION)
    .optional(),
  wait: waitConditionSchema
    .describe("Required for interaction and validation beats. It blocks forward navigation until the registered local condition resolves.")
    .optional(),
});

export const teachingSceneInputSchema = z.strictObject({
  id: identifierSchema,
  title: z.string().min(1).max(120).optional(),
  cleanupPolicy: z.literal("replace").optional(),
  allowManualNavigation: z
    .boolean()
    .describe("Set true for progressive explanations so the learner advances locally with Previous, Next, and Finish instead of asking ChatGPT for each micro-step.")
    .optional(),
  beats: z
    .array(teachingBeatSchema)
    .min(1)
    .describe(
      "Choose the number of beats from the teaching content. Use one clear pedagogical purpose per beat, without filler or concept compression to meet a quota.",
    ),
});

const lessonCriterionSchema = z.strictObject({
  id: identifierSchema,
  requirement: z
    .string()
    .min(1)
    .max(DEFAULT_SYSTEM_LIMITS.maxVisualGuideItemCharacters)
    .describe(
      "Describe this validation gate in learner-visible language. Final coding-exercise numbered requirements are derived from these values in criterion order.",
    ),
  validatorId: identifierSchema,
  input: providerInputSchema.optional(),
});

export const lessonStepInputSchema = z.strictObject({
  id: identifierSchema,
  title: z.string().min(1).max(120),
  objective: z.string().min(1).max(300),
  instructions: z.string().min(1).max(1_000).optional(),
  criteria: z.array(lessonCriterionSchema).max(10).optional(),
  hints: z
    .array(
      z
        .string()
        .min(1)
        .max(300)
        .describe(GUIDE_INLINE_CODE_SYNTAX_DESCRIPTION),
    )
    .max(5)
    .optional(),
});

const lessonEnvironmentSchema = z.strictObject({
  profileId: identifierSchema,
  runtimeProviderId: identifierSchema.optional(),
  languageIds: z.array(identifierSchema).min(1).max(20).optional(),
  surfaces: z.array(surfaceConfigurationInputSchema).max(30).optional(),
  activeFile: workspacePathSchema.optional(),
  activeSurfaceId: identifierSchema.optional(),
});

const lessonFileSchema = z.strictObject({
  path: workspacePathSchema,
  languageId: identifierSchema,
  content: fileContentSchema,
  visible: z.boolean().optional(),
  readOnly: z.boolean().optional(),
});

export const getSystemCapabilitiesInputSchema = withP0Safety(
  z.strictObject({
    include: z
      .array(
        z.enum([
          "profiles",
          "languages",
          "runtimes",
          "surfaces",
          "actions",
          "scene_effects",
          "target_resolvers",
          "assistant_states",
          "interaction_events",
          "locators",
          "validators",
          "limits",
        ]),
      )
      .min(1)
      .max(12)
      .optional(),
    profileId: identifierSchema.optional(),
  }),
);

export const setGuideBuildStatusInputSchema = withP0Safety(
  z
    .strictObject({
      status: z.enum(["building", "completed", "error"]),
      stage: z.enum(GUIDE_BUILD_STAGE_IDS).optional(),
      message: z.string().min(1).max(160).optional(),
    })
    .superRefine((input, context) => {
      if (input.status === "building" && !input.stage) {
        context.addIssue({
          code: "custom",
          message: "A building status requires a guide build stage.",
          path: ["stage"],
        });
      }
      if (input.status === "error" && !input.message) {
        context.addIssue({
          code: "custom",
          message: "An error status requires a learner-facing message.",
          path: ["message"],
        });
      }
      if (input.status !== "building" && input.stage) {
        context.addIssue({
          code: "custom",
          message: "Only a building status accepts a stage.",
          path: ["stage"],
        });
      }
    }),
);

export const createGuidedLessonInputSchema = withP0Safety(
  z.strictObject({
    lessonId: identifierSchema,
    title: z.string().min(1).max(120),
    objective: z.string().min(1).max(300),
    lessonMode: z
      .enum(["explain", "practice", "mixed"])
      .describe("Use explain for complete examples and guided demonstrations without TODO-driven work; practice for incomplete exercises and validation; mixed for explanation followed by a small exercise."),
    description: z.string().min(1).max(1_000).optional(),
    language: z.enum(["es", "en"]).optional(),
    replaceExisting: z.literal(true).optional(),
    environment: lessonEnvironmentSchema,
    files: z.array(lessonFileSchema).min(1).max(DEFAULT_SYSTEM_LIMITS.maxFiles),
    steps: z
      .array(lessonStepInputSchema)
      .min(1)
      .describe(
        "Choose the number of Learning Plan steps from the teaching content. Keep simple lessons concise, but do not add filler or compress distinct concepts to meet a fixed count.",
      ),
    initialScene: teachingSceneInputSchema
      .describe(`For explain or mixed lessons, prefer a complete multi-beat micro-step scene with local navigation. Choose the beat count from the content: keep simple lessons concise, use 10, 15, or more beats when distinct concepts need them, and never add filler or compress concepts to meet a quota. Code explanations should use one semantic target per beat for the exact token, single line, or contiguous multi-line range being discussed and include registered visual effects for that target. Do not create artificial learner waits merely to keep explanations visible. On a final coding exercise, use at most ${DEFAULT_SYSTEM_LIMITS.maxVisualGuideItems} criteria and omit the final beat's guide supportingItems because Lessonique derives the numbered list from each criterion's requirement in matching order.`)
      .optional(),
  }),
);

export const resetClassroomInputSchema = withP0Safety(
  z.strictObject({
    scope: z.enum(["guidance", "runtime", "workspace", "lesson", "all"]),
    preserve: z
      .strictObject({
        theme: z.boolean().optional(),
        layout: z.boolean().optional(),
        activity: z.boolean().optional(),
        snapshots: z.boolean().optional(),
      })
      .optional(),
  }),
);

export const inspectClassroomInputSchema = withP0Safety(
  z.strictObject({
    include: z
      .array(
        z.enum([
          "capabilities",
          "lesson",
          "environment",
          "workspace",
          "file_contents",
          "diagnostics",
          "anchors",
          "validation",
          "runtime",
          "scene",
          "assistant",
          "interaction_targets",
          "activity",
        ]),
      )
      .min(1)
      .max(14)
      .optional(),
    files: z.array(workspacePathSchema).max(DEFAULT_SYSTEM_LIMITS.maxFiles).optional(),
    anchorQuery: targetRefSchema.optional(),
    maxActivity: z
      .number()
      .int()
      .min(1)
      .max(DEFAULT_SYSTEM_LIMITS.maxActivityEvents)
      .optional(),
  }),
);

export const configureLearningEnvironmentInputSchema = withP0Safety(
  z.strictObject({
    profileId: identifierSchema.optional(),
    runtimeProviderId: identifierSchema.optional(),
    languageIds: z.array(identifierSchema).min(1).max(20).optional(),
    visibleFiles: z.array(workspacePathSchema).max(DEFAULT_SYSTEM_LIMITS.maxFiles).optional(),
    activeFile: workspacePathSchema.optional(),
    activeSurfaceId: identifierSchema.optional(),
    surfaces: z.array(surfaceConfigurationInputSchema).max(30).optional(),
    viewport: identifierSchema.optional(),
    transition: z.enum(["instant", "animated"]).optional(),
    clearConsole: z.boolean().optional(),
    actionAfter: identifierSchema.optional(),
  }),
);

const textPositionSchema = z.strictObject({
  line: z.number().int().min(1),
  column: z.number().int().min(1),
});
const textEditSchema = z.strictObject({
  start: textPositionSchema,
  end: textPositionSchema,
  text: fileContentSchema,
});
const workspaceOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("create_file"),
    path: workspacePathSchema,
    languageId: identifierSchema.optional(),
    content: fileContentSchema,
  }),
  z.strictObject({
    type: z.literal("replace_file"),
    path: workspacePathSchema,
    content: fileContentSchema,
  }),
  z.strictObject({
    type: z.literal("patch_file"),
    path: workspacePathSchema,
    edits: z.array(textEditSchema).min(1).max(100),
  }),
  z.strictObject({
    type: z.literal("move_file"),
    from: workspacePathSchema,
    to: workspacePathSchema,
  }),
  z.strictObject({
    type: z.literal("remove_file"),
    path: workspacePathSchema,
  }),
]);

export const applyWorkspaceChangesInputSchema = withP0Safety(
  z.strictObject({
    operations: z.array(workspaceOperationSchema).min(1).max(100),
    openAfter: workspacePathSchema.optional(),
    actionAfter: identifierSchema.optional(),
  }),
);

export const executeEnvironmentActionInputSchema = withP0Safety(
  z.strictObject({
    actionId: identifierSchema,
    input: providerInputSchema.optional(),
    waitForCompletion: z.boolean().optional(),
  }),
);

export const playTeachingSceneInputSchema = withP0Safety(teachingSceneInputSchema);

export const controlTeachingSceneInputSchema = withP0Safety(
  z.strictObject({
    action: z.enum(["pause", "resume", "next", "previous", "restart", "cancel"]),
    sceneId: identifierSchema.optional(),
  }),
);

export const evaluateCurrentStepInputSchema = withP0Safety(
  z.strictObject({
    stepId: identifierSchema.optional(),
    advanceOnPass: z.boolean().optional(),
    showFeedback: z.boolean().optional(),
  }),
);

const lessonStepPatchSchema = z.strictObject({
  title: z.string().min(1).max(120).optional(),
  objective: z.string().min(1).max(300).optional(),
  instructions: z.string().min(1).max(1_000).optional(),
  criteria: z.array(lessonCriterionSchema).max(10).optional(),
  hints: z
    .array(
      z
        .string()
        .min(1)
        .max(300)
        .describe(GUIDE_INLINE_CODE_SYNTAX_DESCRIPTION),
    )
    .max(5)
    .optional(),
});
const lessonPlanOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("replace_steps"),
    steps: z
      .array(lessonStepInputSchema)
      .min(1),
  }),
  z.strictObject({
    type: z.literal("insert_step"),
    step: lessonStepInputSchema,
    afterStepId: identifierSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("update_step"),
    stepId: identifierSchema,
    patch: lessonStepPatchSchema,
  }),
  z.strictObject({ type: z.literal("remove_step"), stepId: identifierSchema }),
  z.strictObject({ type: z.literal("set_active_step"), stepId: identifierSchema }),
  z.strictObject({
    type: z.literal("set_agent_message"),
    message: z.string().min(1).max(500),
  }),
]);

export const updateLessonPlanInputSchema = withP0Safety(
  z.strictObject({
    operations: z.array(lessonPlanOperationSchema).min(1).max(20),
  }),
);

export const showReferencePanelInputSchema = withP0Safety(
  z.strictObject({
    referenceId: identifierSchema,
    title: z.string().min(1).max(120),
    content: z.string().min(1).max(5_000),
    snippets: z
      .array(
        z.strictObject({
          languageId: identifierSchema,
          code: fileContentSchema,
        }),
      )
      .max(5)
      .optional(),
    surfaceId: identifierSchema.optional(),
    focus: z.boolean().optional(),
  }),
);

export const WEBMCP_TOOL_INPUT_SCHEMAS = {
  get_system_capabilities: getSystemCapabilitiesInputSchema,
  set_guide_build_status: setGuideBuildStatusInputSchema,
  create_guided_lesson: createGuidedLessonInputSchema,
  reset_classroom: resetClassroomInputSchema,
  inspect_classroom: inspectClassroomInputSchema,
  configure_learning_environment: configureLearningEnvironmentInputSchema,
  apply_workspace_changes: applyWorkspaceChangesInputSchema,
  execute_environment_action: executeEnvironmentActionInputSchema,
  play_teaching_scene: playTeachingSceneInputSchema,
  control_teaching_scene: controlTeachingSceneInputSchema,
  evaluate_current_step: evaluateCurrentStepInputSchema,
  update_lesson_plan: updateLessonPlanInputSchema,
  show_reference_panel: showReferencePanelInputSchema,
} as const satisfies Record<WebMCPToolName, z.ZodType>;

export type WebMCPJsonSchema = Record<string, unknown> & {
  type: "object";
  properties: Record<string, unknown>;
  additionalProperties: false;
};

export function getWebMCPToolJsonSchema(name: WebMCPToolName): WebMCPJsonSchema {
  const schema = z.toJSONSchema(WEBMCP_TOOL_INPUT_SCHEMAS[name], {
    target: "draft-07",
    io: "input",
    reused: "inline",
  });
  if (
    schema.type !== "object" ||
    schema.additionalProperties !== false ||
    !schema.properties
  ) {
    throw new Error(`Tool "${name}" did not produce a closed object schema.`);
  }
  return schema as WebMCPJsonSchema;
}

function withP0Safety<T extends z.ZodType>(schema: T): T {
  return schema.superRefine((value, context) => {
    addForbiddenKeyIssues(value, FORBIDDEN_P0_KEYS, context);
  });
}

function addForbiddenKeyIssues(
  value: unknown,
  forbiddenKeys: ReadonlySet<string>,
  context: z.RefinementCtx,
  path: PropertyKey[] = [],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      addForbiddenKeyIssues(entry, forbiddenKeys, context, [...path, index]),
    );
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  Object.entries(value).forEach(([key, entry]) => {
    const nextPath = [...path, key];
    if (forbiddenKeys.has(normalizeKey(key))) {
      context.addIssue({
        code: "custom",
        message: `Property "${key}" is not supported in P0/V1.`,
        path: nextPath,
      });
    }
    addForbiddenKeyIssues(entry, forbiddenKeys, context, nextPath);
  });
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
}

function isSafeWorkspacePath(path: string): boolean {
  if (/^(?:[A-Za-z]:|[\\/])/u.test(path) || path.includes("\\")) {
    return false;
  }
  return path.split("/").every((segment) => segment !== "" && segment !== ".." && segment !== ".");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

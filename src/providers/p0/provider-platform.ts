import type {
  AssistantPlacementDefinition,
  AssistantStateDefinition,
  EnvironmentActionDefinition,
  EnvironmentProfile,
  GuidanceEffectDefinition,
  InteractionAnchorDefinition,
  InteractionEventTypeDefinition,
  LanguageProvider,
  RuntimeProvider,
  SurfaceDefinition,
  TargetResolverDefinition,
} from "@/core/platform/contracts";
import type { ClosedJsonObjectSchema } from "@/core/platform/json-schema";
import { ProviderPlatformRegistries } from "@/core/platform/registries";

export const P0_LANGUAGE_IDS = {
  html: "language.html",
  css: "language.css",
  javascript: "language.javascript",
} as const;

export const P0_RUNTIME_PROVIDER_IDS = {
  sandpackVanilla: "runtime.sandpack-vanilla",
} as const;

export const P0_ENVIRONMENT_PROFILE_IDS = {
  vanillaWeb: "profile.vanilla-web",
  javascriptConsole: "profile.javascript-console",
} as const;

export const P0_SURFACE_IDS = {
  editor: "editor",
  preview: "preview",
  console: "console",
  values: "values",
  plan: "plan",
  activity: "activity",
} as const;

export const P0_ENVIRONMENT_ACTION_IDS = {
  run: "runtime.run",
  stop: "runtime.stop",
  restart: "runtime.restart",
  clearConsole: "runtime.clear-console",
  focusEditor: "surface.editor.focus",
  reloadPreview: "surface.preview.reload",
} as const;

export const P0_TARGET_RESOLVER_IDS = {
  codeRange: "target.code-range",
  previewAnchor: "target.preview-anchor",
  consoleEntry: "target.console-entry",
  surfaceAnchor: "target.surface-anchor",
} as const;

export const P0_GUIDANCE_EFFECT_IDS = {
  focus: "effect.focus",
  spotlight: "effect.spotlight",
  point: "effect.point",
} as const;

export const P0_ASSISTANT_STATE_IDS = {
  idle: "assistant.idle",
  explaining: "assistant.explaining",
  pointing: "assistant.pointing",
  thinking: "assistant.thinking",
  success: "assistant.success",
  warning: "assistant.warning",
} as const;

export const P0_ASSISTANT_PLACEMENT_IDS = {
  floating: "placement.floating",
  nearTarget: "placement.near-target",
} as const;

export const P0_INTERACTION_EVENT_TYPE_IDS = {
  editorChange: "interaction.editor-change",
  previewClick: "interaction.preview-click",
  previewChange: "interaction.preview-change",
  previewSubmit: "interaction.preview-submit",
  surfaceActivate: "interaction.surface-activate",
} as const;

export const P0_INTERACTION_ANCHOR_IDS = {
  editor: "anchor.workspace-editor",
  preview: "anchor.workspace-preview",
  console: "anchor.workspace-console",
  plan: "anchor.learning-plan",
  activity: "anchor.live-activity",
} as const;

const EMPTY_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const satisfies ClosedJsonObjectSchema;

const SEMANTIC_ID_SCHEMA = {
  type: "string",
  minLength: 1,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
} as const;

const RUNTIME_ACTION_IDS = [
  P0_ENVIRONMENT_ACTION_IDS.run,
  P0_ENVIRONMENT_ACTION_IDS.stop,
  P0_ENVIRONMENT_ACTION_IDS.restart,
  P0_ENVIRONMENT_ACTION_IDS.clearConsole,
] as const;

const SHARED_PROFILE_ACTION_IDS = [
  ...RUNTIME_ACTION_IDS,
  P0_ENVIRONMENT_ACTION_IDS.focusEditor,
] as const;

const LANGUAGE_PROVIDERS = [
  {
    id: P0_LANGUAGE_IDS.html,
    displayName: "HTML",
    extensions: [".html"],
    monacoLanguageId: "html",
    defaultFileNames: ["index.html"],
    locatorIds: [],
    validatorIds: [],
  },
  {
    id: P0_LANGUAGE_IDS.css,
    displayName: "CSS",
    extensions: [".css"],
    monacoLanguageId: "css",
    defaultFileNames: ["styles.css"],
    locatorIds: [],
    validatorIds: [],
  },
  {
    id: P0_LANGUAGE_IDS.javascript,
    displayName: "JavaScript",
    extensions: [".js"],
    monacoLanguageId: "javascript",
    defaultFileNames: ["script.js"],
    locatorIds: [],
    validatorIds: [],
  },
] as const satisfies readonly LanguageProvider[];

const RUNTIME_PROVIDERS = [
  {
    id: P0_RUNTIME_PROVIDER_IDS.sandpackVanilla,
    displayName: "Sandpack Vanilla",
    supportedLanguageIds: [
      P0_LANGUAGE_IDS.html,
      P0_LANGUAGE_IDS.css,
      P0_LANGUAGE_IDS.javascript,
    ],
    capabilities: {
      preview: true,
      console: true,
      terminal: false,
      run: true,
      stop: true,
      restart: true,
      test: false,
      lint: false,
      format: false,
      packages: false,
      network: false,
    },
    actionIds: RUNTIME_ACTION_IDS,
  },
] as const satisfies readonly RuntimeProvider[];

const SURFACES = [
  {
    id: P0_SURFACE_IDS.editor,
    displayName: "Editor",
    supportedModeIds: ["code", "read_only"],
    supportedPlacementIds: ["main"],
    configurationOptions: [
      {
        id: "editor.word-wrap",
        valueType: "boolean",
        defaultValue: true,
      },
      {
        id: "editor.minimap",
        valueType: "boolean",
        defaultValue: false,
      },
      {
        id: "editor.font-size",
        valueType: "number",
        defaultValue: 14,
        minimum: 12,
        maximum: 24,
      },
    ],
    actionIds: [P0_ENVIRONMENT_ACTION_IDS.focusEditor],
  },
  {
    id: P0_SURFACE_IDS.preview,
    displayName: "Preview",
    supportedModeIds: ["desktop", "tablet", "mobile"],
    supportedPlacementIds: ["main", "bottom"],
    configurationOptions: [],
    actionIds: [P0_ENVIRONMENT_ACTION_IDS.reloadPreview],
  },
  {
    id: P0_SURFACE_IDS.console,
    displayName: "Console",
    supportedModeIds: ["output"],
    supportedPlacementIds: ["main", "bottom"],
    configurationOptions: [],
    actionIds: [],
  },
  {
    id: P0_SURFACE_IDS.values,
    displayName: "Values",
    supportedModeIds: ["table"],
    supportedPlacementIds: ["main", "bottom"],
    configurationOptions: [],
    actionIds: [],
  },
  {
    id: P0_SURFACE_IDS.plan,
    displayName: "Learning Plan",
    supportedModeIds: ["steps"],
    supportedPlacementIds: ["right"],
    configurationOptions: [],
    actionIds: [],
  },
  {
    id: P0_SURFACE_IDS.activity,
    displayName: "Live Activity",
    supportedModeIds: ["feed"],
    supportedPlacementIds: ["right"],
    configurationOptions: [],
    actionIds: [],
  },
] as const satisfies readonly SurfaceDefinition[];

const ENVIRONMENT_PROFILES = [
  {
    id: P0_ENVIRONMENT_PROFILE_IDS.vanillaWeb,
    displayName: "Vanilla Web",
    runtimeProviderId: P0_RUNTIME_PROVIDER_IDS.sandpackVanilla,
    defaultLanguageIds: [
      P0_LANGUAGE_IDS.html,
      P0_LANGUAGE_IDS.css,
      P0_LANGUAGE_IDS.javascript,
    ],
    allowedLanguageIds: [
      P0_LANGUAGE_IDS.html,
      P0_LANGUAGE_IDS.css,
      P0_LANGUAGE_IDS.javascript,
    ],
    defaultFiles: [
      {
        path: "index.html",
        languageId: P0_LANGUAGE_IDS.html,
        content:
          '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Lessonique Workspace</title>\n    <link rel="stylesheet" href="./styles.css" />\n  </head>\n  <body>\n    <main id="app"></main>\n    <script src="./script.js"></script>\n  </body>\n</html>\n',
        visible: true,
      },
      {
        path: "styles.css",
        languageId: P0_LANGUAGE_IDS.css,
        content: "",
        visible: true,
      },
      {
        path: "script.js",
        languageId: P0_LANGUAGE_IDS.javascript,
        content: "",
        visible: true,
      },
    ],
    defaultSurfaces: [
      {
        id: P0_SURFACE_IDS.editor,
        visible: true,
        order: 0,
        placementId: "main",
        modeId: "code",
      },
      {
        id: P0_SURFACE_IDS.preview,
        visible: true,
        order: 1,
        placementId: "bottom",
        modeId: "desktop",
      },
      {
        id: P0_SURFACE_IDS.console,
        visible: true,
        order: 2,
        placementId: "bottom",
        modeId: "output",
      },
      {
        id: P0_SURFACE_IDS.plan,
        visible: true,
        order: 3,
        placementId: "right",
        modeId: "steps",
      },
      {
        id: P0_SURFACE_IDS.activity,
        visible: true,
        order: 4,
        placementId: "right",
        modeId: "feed",
      },
    ],
    allowedSurfaceIds: [
      P0_SURFACE_IDS.editor,
      P0_SURFACE_IDS.preview,
      P0_SURFACE_IDS.console,
      P0_SURFACE_IDS.plan,
      P0_SURFACE_IDS.activity,
    ],
    allowedActionIds: [
      ...SHARED_PROFILE_ACTION_IDS,
      P0_ENVIRONMENT_ACTION_IDS.reloadPreview,
    ],
  },
  {
    id: P0_ENVIRONMENT_PROFILE_IDS.javascriptConsole,
    displayName: "JavaScript Console",
    runtimeProviderId: P0_RUNTIME_PROVIDER_IDS.sandpackVanilla,
    defaultLanguageIds: [P0_LANGUAGE_IDS.javascript],
    allowedLanguageIds: [P0_LANGUAGE_IDS.javascript],
    defaultFiles: [
      {
        path: "script.js",
        languageId: P0_LANGUAGE_IDS.javascript,
        content: "",
        visible: true,
      },
    ],
    defaultSurfaces: [
      {
        id: P0_SURFACE_IDS.editor,
        visible: true,
        order: 0,
        placementId: "main",
        modeId: "code",
      },
      {
        id: P0_SURFACE_IDS.console,
        visible: true,
        order: 1,
        placementId: "bottom",
        modeId: "output",
      },
      {
        id: P0_SURFACE_IDS.values,
        visible: false,
        order: 2,
        placementId: "bottom",
        modeId: "table",
      },
      {
        id: P0_SURFACE_IDS.plan,
        visible: true,
        order: 3,
        placementId: "right",
        modeId: "steps",
      },
      {
        id: P0_SURFACE_IDS.activity,
        visible: true,
        order: 4,
        placementId: "right",
        modeId: "feed",
      },
    ],
    allowedSurfaceIds: [
      P0_SURFACE_IDS.editor,
      P0_SURFACE_IDS.console,
      P0_SURFACE_IDS.values,
      P0_SURFACE_IDS.plan,
      P0_SURFACE_IDS.activity,
    ],
    allowedActionIds: SHARED_PROFILE_ACTION_IDS,
  },
] as const satisfies readonly EnvironmentProfile[];

const ENVIRONMENT_ACTIONS = [
  ...RUNTIME_ACTION_IDS.map((id) => ({
    id,
    ownerType: "runtime" as const,
    ownerId: P0_RUNTIME_PROVIDER_IDS.sandpackVanilla,
    inputSchema: EMPTY_INPUT_SCHEMA,
  })),
  {
    id: P0_ENVIRONMENT_ACTION_IDS.focusEditor,
    ownerType: "surface",
    ownerId: P0_SURFACE_IDS.editor,
    inputSchema: EMPTY_INPUT_SCHEMA,
  },
  {
    id: P0_ENVIRONMENT_ACTION_IDS.reloadPreview,
    ownerType: "surface",
    ownerId: P0_SURFACE_IDS.preview,
    inputSchema: EMPTY_INPUT_SCHEMA,
  },
] satisfies readonly EnvironmentActionDefinition[];

const GUIDANCE_EFFECTS = [
  {
    id: P0_GUIDANCE_EFFECT_IDS.focus,
    displayName: "Focus",
    inputSchema: EMPTY_INPUT_SCHEMA,
  },
  {
    id: P0_GUIDANCE_EFFECT_IDS.spotlight,
    displayName: "Spotlight",
    inputSchema: EMPTY_INPUT_SCHEMA,
  },
  {
    id: P0_GUIDANCE_EFFECT_IDS.point,
    displayName: "Point",
    inputSchema: EMPTY_INPUT_SCHEMA,
  },
] satisfies readonly GuidanceEffectDefinition[];

const INTERACTION_EVENT_TYPES = [
  { id: P0_INTERACTION_EVENT_TYPE_IDS.editorChange, displayName: "Editor change" },
  { id: P0_INTERACTION_EVENT_TYPE_IDS.previewClick, displayName: "Preview click" },
  { id: P0_INTERACTION_EVENT_TYPE_IDS.previewChange, displayName: "Preview change" },
  { id: P0_INTERACTION_EVENT_TYPE_IDS.previewSubmit, displayName: "Preview submit" },
  { id: P0_INTERACTION_EVENT_TYPE_IDS.surfaceActivate, displayName: "Surface activation" },
] satisfies readonly InteractionEventTypeDefinition[];

const ASSISTANT_STATES = [
  { id: P0_ASSISTANT_STATE_IDS.idle, displayName: "Idle" },
  { id: P0_ASSISTANT_STATE_IDS.explaining, displayName: "Explaining" },
  { id: P0_ASSISTANT_STATE_IDS.pointing, displayName: "Pointing" },
  { id: P0_ASSISTANT_STATE_IDS.thinking, displayName: "Thinking" },
  { id: P0_ASSISTANT_STATE_IDS.success, displayName: "Success" },
  { id: P0_ASSISTANT_STATE_IDS.warning, displayName: "Warning" },
] satisfies readonly AssistantStateDefinition[];

const ASSISTANT_PLACEMENTS = [
  {
    id: P0_ASSISTANT_PLACEMENT_IDS.floating,
    displayName: "Floating",
    requiresTarget: false,
  },
  {
    id: P0_ASSISTANT_PLACEMENT_IDS.nearTarget,
    displayName: "Near target",
    requiresTarget: true,
  },
] satisfies readonly AssistantPlacementDefinition[];

const TARGET_RESOLVERS: readonly TargetResolverDefinition[] = [
  {
    id: P0_TARGET_RESOLVER_IDS.codeRange,
    displayName: "Code range",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", minLength: 1, maxLength: 256 },
        startLine: { type: "integer", minimum: 1 },
        startColumn: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
        endColumn: { type: "integer", minimum: 1 },
      },
      required: [
        "filePath",
        "startLine",
        "startColumn",
        "endLine",
        "endColumn",
      ],
      additionalProperties: false,
    },
    supportedEffectIds: [
      P0_GUIDANCE_EFFECT_IDS.focus,
      P0_GUIDANCE_EFFECT_IDS.spotlight,
      P0_GUIDANCE_EFFECT_IDS.point,
    ],
    supportedInteractionEventTypeIds: [
      P0_INTERACTION_EVENT_TYPE_IDS.editorChange,
    ],
  },
  {
    id: P0_TARGET_RESOLVER_IDS.previewAnchor,
    displayName: "Preview semantic anchor",
    inputSchema: {
      type: "object",
      properties: { anchorId: SEMANTIC_ID_SCHEMA },
      required: ["anchorId"],
      additionalProperties: false,
    },
    supportedEffectIds: [
      P0_GUIDANCE_EFFECT_IDS.focus,
      P0_GUIDANCE_EFFECT_IDS.spotlight,
      P0_GUIDANCE_EFFECT_IDS.point,
    ],
    supportedInteractionEventTypeIds: [
      P0_INTERACTION_EVENT_TYPE_IDS.previewClick,
      P0_INTERACTION_EVENT_TYPE_IDS.previewChange,
      P0_INTERACTION_EVENT_TYPE_IDS.previewSubmit,
    ],
  },
  {
    id: P0_TARGET_RESOLVER_IDS.consoleEntry,
    displayName: "Console entry",
    inputSchema: {
      type: "object",
      properties: { entryId: SEMANTIC_ID_SCHEMA },
      required: ["entryId"],
      additionalProperties: false,
    },
    supportedEffectIds: [
      P0_GUIDANCE_EFFECT_IDS.focus,
      P0_GUIDANCE_EFFECT_IDS.spotlight,
      P0_GUIDANCE_EFFECT_IDS.point,
    ],
    supportedInteractionEventTypeIds: [],
  },
  {
    id: P0_TARGET_RESOLVER_IDS.surfaceAnchor,
    displayName: "Registered surface anchor",
    inputSchema: {
      type: "object",
      properties: { anchorId: SEMANTIC_ID_SCHEMA },
      required: ["anchorId"],
      additionalProperties: false,
    },
    supportedEffectIds: [
      P0_GUIDANCE_EFFECT_IDS.focus,
      P0_GUIDANCE_EFFECT_IDS.spotlight,
      P0_GUIDANCE_EFFECT_IDS.point,
    ],
    supportedInteractionEventTypeIds: [
      P0_INTERACTION_EVENT_TYPE_IDS.surfaceActivate,
    ],
  },
];

const INTERACTION_ANCHORS = [
  {
    id: P0_INTERACTION_ANCHOR_IDS.editor,
    displayName: "Workspace editor",
    surfaceId: P0_SURFACE_IDS.editor,
  },
  {
    id: P0_INTERACTION_ANCHOR_IDS.preview,
    displayName: "Workspace preview",
    surfaceId: P0_SURFACE_IDS.preview,
  },
  {
    id: P0_INTERACTION_ANCHOR_IDS.console,
    displayName: "Workspace console",
    surfaceId: P0_SURFACE_IDS.console,
  },
  {
    id: P0_INTERACTION_ANCHOR_IDS.plan,
    displayName: "Learning plan",
    surfaceId: P0_SURFACE_IDS.plan,
  },
  {
    id: P0_INTERACTION_ANCHOR_IDS.activity,
    displayName: "Live activity",
    surfaceId: P0_SURFACE_IDS.activity,
  },
] satisfies readonly InteractionAnchorDefinition[];

export function registerP0ProviderPlatform(
  registries: ProviderPlatformRegistries,
): ProviderPlatformRegistries {
  LANGUAGE_PROVIDERS.forEach((provider) =>
    registries.languages.register(provider),
  );
  RUNTIME_PROVIDERS.forEach((provider) =>
    registries.runtimes.register(provider),
  );
  SURFACES.forEach((surface) => registries.surfaces.register(surface));
  ENVIRONMENT_PROFILES.forEach((profile) =>
    registries.environmentProfiles.register(profile),
  );
  ENVIRONMENT_ACTIONS.forEach((action) =>
    registries.actions.register(action),
  );
  GUIDANCE_EFFECTS.forEach((effect) =>
    registries.guidance.effects.register(effect),
  );
  INTERACTION_EVENT_TYPES.forEach((eventType) =>
    registries.guidance.interactionEventTypes.register(eventType),
  );
  ASSISTANT_STATES.forEach((state) =>
    registries.guidance.assistantStates.register(state),
  );
  ASSISTANT_PLACEMENTS.forEach((placement) =>
    registries.guidance.assistantPlacements.register(placement),
  );
  TARGET_RESOLVERS.forEach((resolver) =>
    registries.targetResolvers.register(resolver),
  );
  INTERACTION_ANCHORS.forEach((anchor) =>
    registries.interactionAnchors.register(anchor),
  );

  return registries;
}

export function createP0ProviderPlatform(): ProviderPlatformRegistries {
  return registerP0ProviderPlatform(new ProviderPlatformRegistries());
}

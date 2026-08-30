import type {
  EnvironmentActionDefinition,
  EnvironmentProfile,
  LanguageProvider,
  RuntimeProvider,
  SurfaceDefinition,
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

const EMPTY_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const satisfies ClosedJsonObjectSchema;

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

  return registries;
}

export function createP0ProviderPlatform(): ProviderPlatformRegistries {
  return registerP0ProviderPlatform(new ProviderPlatformRegistries());
}

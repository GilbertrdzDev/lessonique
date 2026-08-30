import type {
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

export const FAKE_PROVIDER_IDS = {
  language: "language.fake",
  runtime: "runtime.fake",
  profile: "profile.fake",
  surface: "surface.fake",
  runtimeAction: "runtime.fake-run",
  surfaceAction: "surface.fake-toggle",
  surfaceOption: "surface.fake-density",
  targetResolver: "target.fake",
  interactionAnchor: "anchor.fake-surface",
  guidanceEffect: "effect.fake",
  interactionEventType: "interaction.fake-activate",
} as const;

const EMPTY_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const satisfies ClosedJsonObjectSchema;

const language: LanguageProvider = {
  id: FAKE_PROVIDER_IDS.language,
  displayName: "Fake Language",
  extensions: [".fake"],
  monacoLanguageId: "plaintext",
  defaultFileNames: ["lesson.fake"],
  locatorIds: [],
  validatorIds: [],
};

const runtime: RuntimeProvider = {
  id: FAKE_PROVIDER_IDS.runtime,
  displayName: "Fake Runtime",
  supportedLanguageIds: [FAKE_PROVIDER_IDS.language],
  capabilities: {
    preview: false,
    console: true,
    terminal: false,
    run: true,
    stop: false,
    restart: false,
    test: false,
    lint: false,
    format: false,
    packages: false,
    network: false,
  },
  actionIds: [FAKE_PROVIDER_IDS.runtimeAction],
};

const surface: SurfaceDefinition = {
  id: FAKE_PROVIDER_IDS.surface,
  displayName: "Fake Surface",
  supportedModeIds: ["compact", "comfortable"],
  supportedPlacementIds: ["main"],
  configurationOptions: [
    {
      id: FAKE_PROVIDER_IDS.surfaceOption,
      valueType: "string",
      defaultValue: "compact",
      allowedValues: ["compact", "comfortable"],
    },
  ],
  actionIds: [FAKE_PROVIDER_IDS.surfaceAction],
};

const profile: EnvironmentProfile = {
  id: FAKE_PROVIDER_IDS.profile,
  displayName: "Fake Environment",
  runtimeProviderId: FAKE_PROVIDER_IDS.runtime,
  defaultLanguageIds: [FAKE_PROVIDER_IDS.language],
  allowedLanguageIds: [FAKE_PROVIDER_IDS.language],
  defaultFiles: [
    {
      path: "lesson.fake",
      languageId: FAKE_PROVIDER_IDS.language,
      content: "fake lesson",
      visible: true,
    },
  ],
  defaultSurfaces: [
    {
      id: FAKE_PROVIDER_IDS.surface,
      visible: true,
      order: 0,
      placementId: "main",
      modeId: "compact",
    },
  ],
  allowedSurfaceIds: [FAKE_PROVIDER_IDS.surface],
  allowedActionIds: [
    FAKE_PROVIDER_IDS.runtimeAction,
    FAKE_PROVIDER_IDS.surfaceAction,
  ],
};

const actions: readonly EnvironmentActionDefinition[] = [
  {
    id: FAKE_PROVIDER_IDS.runtimeAction,
    ownerType: "runtime",
    ownerId: FAKE_PROVIDER_IDS.runtime,
    inputSchema: EMPTY_SCHEMA,
  },
  {
    id: FAKE_PROVIDER_IDS.surfaceAction,
    ownerType: "surface",
    ownerId: FAKE_PROVIDER_IDS.surface,
    inputSchema: EMPTY_SCHEMA,
  },
];

const effect: GuidanceEffectDefinition = {
  id: FAKE_PROVIDER_IDS.guidanceEffect,
  displayName: "Fake Focus",
  inputSchema: EMPTY_SCHEMA,
};

const eventType: InteractionEventTypeDefinition = {
  id: FAKE_PROVIDER_IDS.interactionEventType,
  displayName: "Fake Activation",
};

const targetResolver: TargetResolverDefinition = {
  id: FAKE_PROVIDER_IDS.targetResolver,
  displayName: "Fake Target",
  inputSchema: {
    type: "object",
    properties: {
      semanticId: { type: "string", minLength: 1, maxLength: 64 },
    },
    required: ["semanticId"],
    additionalProperties: false,
  },
  supportedEffectIds: [FAKE_PROVIDER_IDS.guidanceEffect],
  supportedInteractionEventTypeIds: [
    FAKE_PROVIDER_IDS.interactionEventType,
  ],
};

const interactionAnchor: InteractionAnchorDefinition = {
  id: FAKE_PROVIDER_IDS.interactionAnchor,
  displayName: "Fake Surface Anchor",
  surfaceId: FAKE_PROVIDER_IDS.surface,
};

export function createFakeProviderPlatform(): ProviderPlatformRegistries {
  const registries = new ProviderPlatformRegistries();
  registries.languages.register(language);
  registries.runtimes.register(runtime);
  registries.surfaces.register(surface);
  registries.environmentProfiles.register(profile);
  actions.forEach((action) => registries.actions.register(action));
  registries.guidance.effects.register(effect);
  registries.guidance.interactionEventTypes.register(eventType);
  registries.targetResolvers.register(targetResolver);
  registries.interactionAnchors.register(interactionAnchor);
  return registries;
}

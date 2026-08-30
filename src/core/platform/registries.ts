import type {
  AssistantPlacementDefinition,
  AssistantStateDefinition,
  EnvironmentActionDefinition,
  EnvironmentProfile,
  GuidanceEffectDefinition,
  InteractionAnchorDefinition,
  InteractionEventTypeDefinition,
  LanguageProvider,
  LocatorDefinition,
  RuntimeProvider,
  SurfaceDefinition,
  TargetRef,
  TargetResolverDefinition,
  ValidatorDefinition,
} from "./contracts";
import { assertClosedJsonObjectSchema } from "./json-schema";
import { validateClosedJsonObjectInput } from "./json-schema";
import {
  assertNamespacedId,
  InMemoryRegistry,
  InvalidRegistryItemError,
} from "./registry";

const UNSAFE_TARGET_INPUT_KEYS = new Set([
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

export class UnsafeTargetInputError extends Error {
  constructor(key: string) {
    super(
      `Semantic target input cannot contain unsafe locator field "${key}".`,
    );
    this.name = "UnsafeTargetInputError";
  }
}

export class LanguageProviderRegistry extends InMemoryRegistry<LanguageProvider> {
  constructor() {
    super({
      name: "LanguageProviderRegistry",
      validate: (item) => {
        assertNamespacedId(item.id, "Language provider");
        if (item.extensions.some((extension) => !extension.startsWith("."))) {
          throw new InvalidRegistryItemError(
            `Language provider "${item.id}" contains an invalid extension.`,
          );
        }
      },
    });
  }
}

export class RuntimeProviderRegistry extends InMemoryRegistry<RuntimeProvider> {
  constructor() {
    super({
      name: "RuntimeProviderRegistry",
      validate: (item) => assertNamespacedId(item.id, "Runtime provider"),
    });
  }
}

export class EnvironmentProfileRegistry extends InMemoryRegistry<EnvironmentProfile> {
  constructor() {
    super({
      name: "EnvironmentProfileRegistry",
      validate: (item) => assertNamespacedId(item.id, "Environment profile"),
    });
  }
}

export class SurfaceRegistry extends InMemoryRegistry<SurfaceDefinition> {
  constructor() {
    super({
      name: "SurfaceRegistry",
      validate: (item) => {
        const optionIds = new Set<string>();
        for (const option of item.configurationOptions) {
          assertNamespacedId(option.id, "Surface option");
          if (optionIds.has(option.id)) {
            throw new InvalidRegistryItemError(
              `Surface "${item.id}" contains duplicate option "${option.id}".`,
            );
          }
          optionIds.add(option.id);
          validateSurfaceOption(option, item.id);
        }
      },
    });
  }
}

export class EnvironmentActionRegistry extends InMemoryRegistry<EnvironmentActionDefinition> {
  constructor() {
    super({
      name: "EnvironmentActionRegistry",
      validate: (item) => {
        assertNamespacedId(item.id, "Environment action");
        assertClosedJsonObjectSchema(
          item.inputSchema,
          `Environment action "${item.id}" input schema`,
        );
      },
    });
  }
}

export class LocatorRegistry extends InMemoryRegistry<LocatorDefinition> {
  constructor() {
    super({
      name: "LocatorRegistry",
      validate: (item) => {
        assertNamespacedId(item.id, "Locator");
        assertClosedJsonObjectSchema(
          item.inputSchema,
          `Locator "${item.id}" input schema`,
        );
      },
    });
  }
}

export class ValidatorRegistry extends InMemoryRegistry<ValidatorDefinition> {
  constructor() {
    super({
      name: "ValidatorRegistry",
      validate: (item) => {
        assertNamespacedId(item.id, "Validator");
        assertClosedJsonObjectSchema(
          item.inputSchema,
          `Validator "${item.id}" input schema`,
        );
      },
    });
  }
}

export class TargetResolverRegistry extends InMemoryRegistry<TargetResolverDefinition> {
  constructor() {
    super({
      name: "TargetResolverRegistry",
      validate: (item) => {
        assertNamespacedId(item.id, "Target resolver");
        assertClosedJsonObjectSchema(
          item.inputSchema,
          `Target resolver "${item.id}" input schema`,
        );
        rejectUnsafeTargetKeys(item.inputSchema.properties);
      },
    });
  }

  validateReference(target: TargetRef): TargetResolverDefinition {
    const definition = this.require(target.resolverId);
    rejectUnsafeTargetKeys(target.input);
    validateClosedJsonObjectInput(
      definition.inputSchema,
      target.input,
      `Target resolver "${target.resolverId}" input`,
    );
    return definition;
  }
}

export class InteractionAnchorRegistry extends InMemoryRegistry<InteractionAnchorDefinition> {
  constructor() {
    super({
      name: "InteractionAnchorRegistry",
      validate: (item) => assertNamespacedId(item.id, "Interaction anchor"),
    });
  }
}

export class GuidanceEffectRegistry extends InMemoryRegistry<GuidanceEffectDefinition> {
  constructor() {
    super({
      name: "GuidanceEffectRegistry",
      validate: (item) => {
        assertNamespacedId(item.id, "Guidance effect");
        assertClosedJsonObjectSchema(
          item.inputSchema,
          `Guidance effect "${item.id}" input schema`,
        );
      },
    });
  }
}

export class AssistantStateRegistry extends InMemoryRegistry<AssistantStateDefinition> {
  constructor() {
    super({
      name: "AssistantStateRegistry",
      validate: (item) => assertNamespacedId(item.id, "Assistant state"),
    });
  }
}

export class AssistantPlacementRegistry extends InMemoryRegistry<AssistantPlacementDefinition> {
  constructor() {
    super({
      name: "AssistantPlacementRegistry",
      validate: (item) => assertNamespacedId(item.id, "Assistant placement"),
    });
  }
}

export class InteractionEventTypeRegistry extends InMemoryRegistry<InteractionEventTypeDefinition> {
  constructor() {
    super({
      name: "InteractionEventTypeRegistry",
      validate: (item) => assertNamespacedId(item.id, "Interaction event type"),
    });
  }
}

export class GuidanceCapabilityRegistry {
  readonly effects = new GuidanceEffectRegistry();
  readonly assistantStates = new AssistantStateRegistry();
  readonly assistantPlacements = new AssistantPlacementRegistry();
  readonly interactionEventTypes = new InteractionEventTypeRegistry();
}

export class ProviderPlatformRegistries {
  readonly languages = new LanguageProviderRegistry();
  readonly runtimes = new RuntimeProviderRegistry();
  readonly environmentProfiles = new EnvironmentProfileRegistry();
  readonly surfaces = new SurfaceRegistry();
  readonly actions = new EnvironmentActionRegistry();
  readonly locators = new LocatorRegistry();
  readonly validators = new ValidatorRegistry();
  readonly targetResolvers = new TargetResolverRegistry();
  readonly interactionAnchors = new InteractionAnchorRegistry();
  readonly guidance = new GuidanceCapabilityRegistry();
}

function validateSurfaceOption(
  option: SurfaceDefinition["configurationOptions"][number],
  surfaceId: string,
): void {
  if (
    option.valueType !== "number" &&
    (option.minimum !== undefined || option.maximum !== undefined)
  ) {
    throw new InvalidRegistryItemError(
      `Surface option "${option.id}" on "${surfaceId}" uses numeric limits for a non-number value.`,
    );
  }
  if (
    option.minimum !== undefined &&
    option.maximum !== undefined &&
    option.minimum > option.maximum
  ) {
    throw new InvalidRegistryItemError(
      `Surface option "${option.id}" on "${surfaceId}" has an invalid numeric range.`,
    );
  }
  if (
    option.defaultValue !== undefined &&
    !surfaceValueMatchesType(option.defaultValue, option.valueType)
  ) {
    throw new InvalidRegistryItemError(
      `Surface option "${option.id}" on "${surfaceId}" has an invalid default value.`,
    );
  }
  if (
    typeof option.defaultValue === "number" &&
    ((option.minimum !== undefined && option.defaultValue < option.minimum) ||
      (option.maximum !== undefined && option.defaultValue > option.maximum))
  ) {
    throw new InvalidRegistryItemError(
      `Surface option "${option.id}" on "${surfaceId}" has a default value outside its numeric range.`,
    );
  }
  if (
    option.defaultValue !== undefined &&
    option.allowedValues &&
    !option.allowedValues.includes(option.defaultValue)
  ) {
    throw new InvalidRegistryItemError(
      `Surface option "${option.id}" on "${surfaceId}" has a default value outside its allowed values.`,
    );
  }
  if (
    option.allowedValues?.some(
      (value) => !surfaceValueMatchesType(value, option.valueType),
    )
  ) {
    throw new InvalidRegistryItemError(
      `Surface option "${option.id}" on "${surfaceId}" has an invalid allowed value.`,
    );
  }
}

function surfaceValueMatchesType(
  value: string | number | boolean,
  expectedType: "string" | "number" | "boolean",
): boolean {
  return typeof value === expectedType;
}

function rejectUnsafeTargetKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(rejectUnsafeTargetKeys);
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (UNSAFE_TARGET_INPUT_KEYS.has(normalizeKey(key))) {
      throw new UnsafeTargetInputError(key);
    }
    rejectUnsafeTargetKeys(entry);
  }
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

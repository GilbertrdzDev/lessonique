import type {
  AssistantPlacementDefinition,
  AssistantStateDefinition,
  EnvironmentActionDefinition,
  EnvironmentProfile,
  GuidanceEffectDefinition,
  InteractionEventTypeDefinition,
  LanguageProvider,
  RuntimeProvider,
  SurfaceDefinition,
  SurfaceOptionDefinition,
  TargetResolverDefinition,
} from "@/core/platform/contracts";
import {
  CapabilityCatalog,
  type SystemCapabilities,
} from "@/core/platform/capability-catalog";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import { SchemaValidationError, validateClosedJsonObjectInput } from "@/core/platform/json-schema";

import type {
  GetSystemCapabilitiesInput,
  SurfaceConfigurationInput,
  TargetRefInput,
} from "./contracts";
import { getSystemCapabilitiesInputSchema } from "./schemas";

export type CapabilityCategory =
  | "profile"
  | "runtime"
  | "language"
  | "surface"
  | "surface_mode"
  | "surface_placement"
  | "surface_option"
  | "action"
  | "target_resolver"
  | "guidance_effect"
  | "assistant_state"
  | "assistant_placement"
  | "interaction_event";

export class CapabilityValidationError extends Error {
  readonly code: "unsupported_capability" | "invalid_capability_input";
  readonly category: CapabilityCategory;
  readonly requestedId: string;
  readonly supportedAlternatives: string[];

  constructor(options: {
    code?: CapabilityValidationError["code"];
    category: CapabilityCategory;
    requestedId: string;
    message: string;
    supportedAlternatives?: readonly string[];
  }) {
    super(options.message);
    this.name = "CapabilityValidationError";
    this.code = options.code ?? "unsupported_capability";
    this.category = options.category;
    this.requestedId = options.requestedId;
    this.supportedAlternatives = [...(options.supportedAlternatives ?? [])];
  }
}

export type GetSystemCapabilitiesData = Partial<SystemCapabilities>;

const DEFAULT_CAPABILITY_SECTIONS = [
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
] as const;

export class GetSystemCapabilitiesService {
  readonly #catalog: CapabilityCatalog;
  readonly #validator: CapabilityValidator;

  constructor(catalog: CapabilityCatalog, validator: CapabilityValidator) {
    this.#catalog = catalog;
    this.#validator = validator;
  }

  execute(input: GetSystemCapabilitiesInput): GetSystemCapabilitiesData {
    const parsed = getSystemCapabilitiesInputSchema.parse(input);
    if (parsed.profileId) {
      this.#validator.requireProfile(parsed.profileId);
    }
    const capabilities = this.#catalog.getCapabilities({
      ...(parsed.profileId ? { profileId: parsed.profileId } : {}),
    });
    const sections = new Set(parsed.include ?? DEFAULT_CAPABILITY_SECTIONS);
    const result: GetSystemCapabilitiesData = {};

    if (sections.has("profiles")) result.environmentProfiles = capabilities.environmentProfiles;
    if (sections.has("languages")) result.languages = capabilities.languages;
    if (sections.has("runtimes")) result.runtimes = capabilities.runtimes;
    if (sections.has("surfaces")) result.surfaces = capabilities.surfaces;
    if (sections.has("actions")) result.actions = capabilities.actions;
    if (sections.has("scene_effects")) result.sceneEffects = capabilities.sceneEffects;
    if (sections.has("target_resolvers")) result.targetResolvers = capabilities.targetResolvers;
    if (sections.has("assistant_states")) {
      result.assistantStates = capabilities.assistantStates;
      result.assistantPlacements = capabilities.assistantPlacements;
    }
    if (sections.has("interaction_events")) {
      result.interactionEventTypes = capabilities.interactionEventTypes;
    }
    if (sections.has("locators")) result.locators = capabilities.locators;
    if (sections.has("validators")) result.validators = capabilities.validators;
    if (sections.has("limits")) result.limits = capabilities.limits;

    return result;
  }
}

export class CapabilityValidator {
  readonly #registries: ProviderPlatformRegistries;

  constructor(registries: ProviderPlatformRegistries) {
    this.#registries = registries;
  }

  requireProfile(profileId: string): EnvironmentProfile {
    return this.#require(
      "profile",
      profileId,
      this.#registries.environmentProfiles.get(profileId),
      this.#registries.environmentProfiles.list(),
    );
  }

  requireRuntime(runtimeProviderId: string, profileId?: string): RuntimeProvider {
    const runtime = this.#require(
      "runtime",
      runtimeProviderId,
      this.#registries.runtimes.get(runtimeProviderId),
      this.#registries.runtimes.list(),
    );
    if (profileId && this.requireProfile(profileId).runtimeProviderId !== runtimeProviderId) {
      throw this.#unsupported(
        "runtime",
        runtimeProviderId,
        `Runtime "${runtimeProviderId}" is not supported by profile "${profileId}".`,
        [this.requireProfile(profileId).runtimeProviderId],
      );
    }
    return runtime;
  }

  requireLanguage(languageId: string, profileId?: string): LanguageProvider {
    const language = this.#require(
      "language",
      languageId,
      this.#registries.languages.get(languageId),
      this.#registries.languages.list(),
    );
    if (profileId) {
      const profile = this.requireProfile(profileId);
      if (!profile.allowedLanguageIds.includes(languageId)) {
        throw this.#unsupported(
          "language",
          languageId,
          `Language "${languageId}" is not supported by profile "${profileId}".`,
          profile.allowedLanguageIds,
        );
      }
    }
    return language;
  }

  validateSurface(
    configuration: SurfaceConfigurationInput,
    profileId?: string,
  ): SurfaceDefinition {
    const surface = this.#require(
      "surface",
      configuration.id,
      this.#registries.surfaces.get(configuration.id),
      this.#registries.surfaces.list(),
    );
    if (profileId) {
      const profile = this.requireProfile(profileId);
      if (!profile.allowedSurfaceIds.includes(surface.id)) {
        throw this.#unsupported(
          "surface",
          surface.id,
          `Surface "${surface.id}" is not supported by profile "${profileId}".`,
          profile.allowedSurfaceIds,
        );
      }
    }
    if (configuration.modeId && !surface.supportedModeIds.includes(configuration.modeId)) {
      throw this.#unsupported(
        "surface_mode",
        configuration.modeId,
        `Mode "${configuration.modeId}" is not supported by surface "${surface.id}".`,
        surface.supportedModeIds,
      );
    }
    if (
      configuration.placementId &&
      !surface.supportedPlacementIds.includes(configuration.placementId)
    ) {
      throw this.#unsupported(
        "surface_placement",
        configuration.placementId,
        `Placement "${configuration.placementId}" is not supported by surface "${surface.id}".`,
        surface.supportedPlacementIds,
      );
    }
    if (
      configuration.size !== undefined &&
      (!Number.isFinite(configuration.size) || configuration.size <= 0)
    ) {
      throw this.#invalid(
        "surface",
        surface.id,
        `Surface "${surface.id}" requires a positive finite size.`,
      );
    }

    const seenOptionIds = new Set<string>();
    for (const option of configuration.options ?? []) {
      if (seenOptionIds.has(option.optionId)) {
        throw this.#invalid(
          "surface_option",
          option.optionId,
          `Surface option "${option.optionId}" is duplicated.`,
        );
      }
      seenOptionIds.add(option.optionId);
      const definition = surface.configurationOptions.find(({ id }) => id === option.optionId);
      if (!definition) {
        throw this.#unsupported(
          "surface_option",
          option.optionId,
          `Option "${option.optionId}" is not supported by surface "${surface.id}".`,
          surface.configurationOptions.map(({ id }) => id),
        );
      }
      this.#validateSurfaceOption(definition, option.value, surface.id);
    }

    return surface;
  }

  validateAction(
    actionId: string,
    input: Record<string, unknown> = {},
    profileId?: string,
  ): EnvironmentActionDefinition {
    const action = this.#require(
      "action",
      actionId,
      this.#registries.actions.get(actionId),
      this.#registries.actions.list(),
    );
    if (profileId) {
      const profile = this.requireProfile(profileId);
      if (!profile.allowedActionIds.includes(actionId)) {
        throw this.#unsupported(
          "action",
          actionId,
          `Action "${actionId}" is not supported by profile "${profileId}".`,
          profile.allowedActionIds,
        );
      }
    }
    try {
      validateClosedJsonObjectInput(action.inputSchema, input, `Action "${actionId}" input`);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        throw this.#invalid("action", actionId, error.message);
      }
      throw error;
    }
    return action;
  }

  validateTarget(target: TargetRefInput): TargetResolverDefinition {
    try {
      return this.#registries.targetResolvers.validateReference(target);
    } catch (error) {
      throw this.#normalizeRegistryValidation(
        "target_resolver",
        target.resolverId,
        error,
        this.#registries.targetResolvers.list(),
      );
    }
  }

  validateGuidanceEffect(
    effectId: string,
    input: Record<string, unknown> = {},
    targetResolverId?: string,
  ): GuidanceEffectDefinition {
    const effect = this.#require(
      "guidance_effect",
      effectId,
      this.#registries.guidance.effects.get(effectId),
      this.#registries.guidance.effects.list(),
    );
    if (targetResolverId) {
      const resolver = this.#require(
        "target_resolver",
        targetResolverId,
        this.#registries.targetResolvers.get(targetResolverId),
        this.#registries.targetResolvers.list(),
      );
      if (!resolver.supportedEffectIds.includes(effectId)) {
        throw this.#unsupported(
          "guidance_effect",
          effectId,
          `Effect "${effectId}" is not supported by target resolver "${targetResolverId}".`,
          resolver.supportedEffectIds,
        );
      }
    }
    try {
      validateClosedJsonObjectInput(effect.inputSchema, input, `Effect "${effectId}" input`);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        throw this.#invalid("guidance_effect", effectId, error.message);
      }
      throw error;
    }
    return effect;
  }

  requireAssistantState(stateId: string): AssistantStateDefinition {
    return this.#require(
      "assistant_state",
      stateId,
      this.#registries.guidance.assistantStates.get(stateId),
      this.#registries.guidance.assistantStates.list(),
    );
  }

  requireAssistantPlacement(
    placementId: string,
    hasTarget: boolean,
  ): AssistantPlacementDefinition {
    const placement = this.#require(
      "assistant_placement",
      placementId,
      this.#registries.guidance.assistantPlacements.get(placementId),
      this.#registries.guidance.assistantPlacements.list(),
    );
    if (placement.requiresTarget && !hasTarget) {
      throw this.#invalid(
        "assistant_placement",
        placementId,
        `Assistant placement "${placementId}" requires a semantic target.`,
      );
    }
    return placement;
  }

  requireInteractionEvent(
    eventTypeId: string,
    targetResolverId?: string,
  ): InteractionEventTypeDefinition {
    const eventType = this.#require(
      "interaction_event",
      eventTypeId,
      this.#registries.guidance.interactionEventTypes.get(eventTypeId),
      this.#registries.guidance.interactionEventTypes.list(),
    );
    if (targetResolverId) {
      const resolver = this.#require(
        "target_resolver",
        targetResolverId,
        this.#registries.targetResolvers.get(targetResolverId),
        this.#registries.targetResolvers.list(),
      );
      if (!resolver.supportedInteractionEventTypeIds.includes(eventTypeId)) {
        throw this.#unsupported(
          "interaction_event",
          eventTypeId,
          `Interaction event "${eventTypeId}" is not supported by target resolver "${targetResolverId}".`,
          resolver.supportedInteractionEventTypeIds,
        );
      }
    }
    return eventType;
  }

  #validateSurfaceOption(
    definition: SurfaceOptionDefinition,
    value: string | number | boolean,
    surfaceId: string,
  ): void {
    if (typeof value !== definition.valueType) {
      throw this.#invalid(
        "surface_option",
        definition.id,
        `Option "${definition.id}" on surface "${surfaceId}" requires a ${definition.valueType} value.`,
      );
    }
    if (definition.allowedValues && !definition.allowedValues.includes(value)) {
      throw this.#invalid(
        "surface_option",
        definition.id,
        `Option "${definition.id}" does not accept the supplied value.`,
        definition.allowedValues.map(String),
      );
    }
    if (
      typeof value === "number" &&
      ((definition.minimum !== undefined && value < definition.minimum) ||
        (definition.maximum !== undefined && value > definition.maximum))
    ) {
      throw this.#invalid(
        "surface_option",
        definition.id,
        `Option "${definition.id}" is outside its declared numeric range.`,
      );
    }
  }

  #require<T extends { id: string }>(
    category: CapabilityCategory,
    requestedId: string,
    value: T | undefined,
    supported: readonly T[],
  ): T {
    if (!value) {
      throw this.#unsupported(
        category,
        requestedId,
        `${formatCategory(category)} "${requestedId}" is not registered.`,
        supported.map(({ id }) => id),
      );
    }
    return value;
  }

  #normalizeRegistryValidation<T extends { id: string }>(
    category: CapabilityCategory,
    requestedId: string,
    error: unknown,
    supported: readonly T[],
  ): CapabilityValidationError {
    return error instanceof CapabilityValidationError
      ? error
      : new CapabilityValidationError({
          code: "invalid_capability_input",
          category,
          requestedId,
          message: error instanceof Error ? error.message : "Capability input is invalid.",
          supportedAlternatives: supported.map(({ id }) => id),
        });
  }

  #unsupported(
    category: CapabilityCategory,
    requestedId: string,
    message: string,
    supportedAlternatives: readonly string[] = [],
  ): CapabilityValidationError {
    return new CapabilityValidationError({
      category,
      requestedId,
      message,
      supportedAlternatives,
    });
  }

  #invalid(
    category: CapabilityCategory,
    requestedId: string,
    message: string,
    supportedAlternatives: readonly string[] = [],
  ): CapabilityValidationError {
    return new CapabilityValidationError({
      code: "invalid_capability_input",
      category,
      requestedId,
      message,
      supportedAlternatives,
    });
  }
}

function formatCategory(category: CapabilityCategory): string {
  return category.replaceAll("_", " ");
}

import {
  DEFAULT_SYSTEM_LIMITS,
  type EnvironmentActionDefinition,
  type EnvironmentProfile,
  type GuidanceEffectDefinition,
  type LanguageProvider,
  type LocatorDefinition,
  type RuntimeCapabilities,
  type RuntimeProvider,
  type SurfaceDefinition,
  type SurfaceOptionDefinition,
  type SystemLimits,
  type TargetResolverDefinition,
  type ValidatorDefinition,
} from "./contracts";
import type {
  AssistantPlacementId,
  AssistantStateId,
  EnvironmentActionId,
  EnvironmentProfileId,
  GuidanceEffectId,
  InteractionEventTypeId,
  LanguageId,
  LocatorId,
  RuntimeProviderId,
  SurfaceId,
  TargetResolverId,
  ValidatorId,
} from "./identifiers";
import type { ClosedJsonObjectSchema } from "./json-schema";
import type { ProviderPlatformRegistries } from "./registries";

export interface EnvironmentProfileSummary {
  id: EnvironmentProfileId;
  displayName: string;
  runtimeProviderId: RuntimeProviderId;
  languageIds: LanguageId[];
  defaultLanguageIds: LanguageId[];
  surfaceIds: SurfaceId[];
  actions: EnvironmentActionId[];
  limits?: Partial<SystemLimits>;
}

export interface LanguageProviderSummary {
  id: LanguageId;
  displayName: string;
  extensions: string[];
  monacoLanguageId?: string;
  locators: LocatorId[];
  validators: ValidatorId[];
}

export interface RuntimeProviderSummary {
  id: RuntimeProviderId;
  displayName: string;
  languageIds: LanguageId[];
  capabilities: RuntimeCapabilities;
  actions: EnvironmentActionId[];
}

export interface SurfaceSummary {
  id: SurfaceId;
  displayName: string;
  modes: string[];
  placements: string[];
  configurationOptions: SurfaceOptionDefinition[];
  actions: EnvironmentActionId[];
}

export interface EnvironmentActionSummary {
  id: EnvironmentActionId;
  ownerType: EnvironmentActionDefinition["ownerType"];
  ownerId: string;
  inputSchema: ClosedJsonObjectSchema;
}

export interface LocatorSummary {
  id: LocatorId;
  displayName: string;
  languageId: LanguageId;
  inputSchema: ClosedJsonObjectSchema;
}

export interface ValidatorSummary {
  id: ValidatorId;
  displayName: string;
  languageIds: LanguageId[];
  inputSchema: ClosedJsonObjectSchema;
}

export interface TargetResolverSummary {
  id: TargetResolverId;
  displayName: string;
  inputSchema: ClosedJsonObjectSchema;
  effects: GuidanceEffectId[];
  interactionEventTypes: InteractionEventTypeId[];
}

export interface GuidanceEffectSummary {
  id: GuidanceEffectId;
  displayName: string;
  inputSchema: ClosedJsonObjectSchema;
}

export interface AssistantStateSummary {
  id: AssistantStateId;
  displayName: string;
}

export interface AssistantPlacementSummary {
  id: AssistantPlacementId;
  displayName: string;
  requiresTarget: boolean;
}

export interface InteractionEventTypeSummary {
  id: InteractionEventTypeId;
  displayName: string;
}

export interface SystemCapabilities {
  environmentProfiles: EnvironmentProfileSummary[];
  languages: LanguageProviderSummary[];
  runtimes: RuntimeProviderSummary[];
  surfaces: SurfaceSummary[];
  actions: EnvironmentActionSummary[];
  sceneEffects: GuidanceEffectSummary[];
  targetResolvers: TargetResolverSummary[];
  assistantStates: AssistantStateSummary[];
  assistantPlacements: AssistantPlacementSummary[];
  interactionEventTypes: InteractionEventTypeSummary[];
  locators: LocatorSummary[];
  validators: ValidatorSummary[];
  limits: SystemLimits;
}

export type CapabilityCatalogQuery = {
  profileId?: EnvironmentProfileId;
};

export class CapabilityCatalogConsistencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityCatalogConsistencyError";
  }
}

export class CapabilityCatalog {
  readonly #registries: ProviderPlatformRegistries;
  readonly #baseLimits: Readonly<SystemLimits>;

  constructor(
    registries: ProviderPlatformRegistries,
    baseLimits: Readonly<SystemLimits> = DEFAULT_SYSTEM_LIMITS,
  ) {
    this.#registries = registries;
    this.#baseLimits = baseLimits;
  }

  getCapabilities(query: CapabilityCatalogQuery = {}): SystemCapabilities {
    this.#assertRegistryConsistency();

    const profile = query.profileId
      ? this.#registries.environmentProfiles.require(query.profileId)
      : undefined;
    const scope = this.#createScope(profile);

    return {
      environmentProfiles: scope.environmentProfiles.map(summarizeProfile),
      languages: scope.languages.map(summarizeLanguage),
      runtimes: scope.runtimes.map(summarizeRuntime),
      surfaces: scope.surfaces.map(summarizeSurface),
      actions: scope.actions.map(summarizeAction),
      sceneEffects: this.#registries.guidance.effects
        .list()
        .map(summarizeGuidanceEffect),
      targetResolvers: this.#registries.targetResolvers
        .list()
        .map(summarizeTargetResolver),
      assistantStates: this.#registries.guidance.assistantStates
        .list()
        .map(({ id, displayName }) => ({ id, displayName })),
      assistantPlacements: this.#registries.guidance.assistantPlacements
        .list()
        .map(({ id, displayName, requiresTarget }) => ({
          id,
          displayName,
          requiresTarget,
        })),
      interactionEventTypes:
        this.#registries.guidance.interactionEventTypes
          .list()
          .map(({ id, displayName }) => ({ id, displayName })),
      locators: scope.locators.map(summarizeLocator),
      validators: scope.validators.map(summarizeValidator),
      limits: {
        ...this.#baseLimits,
        ...profile?.limits,
      },
    };
  }

  #createScope(profile?: EnvironmentProfile): CapabilityScope {
    if (!profile) {
      return {
        environmentProfiles: this.#registries.environmentProfiles.list(),
        languages: this.#registries.languages.list(),
        runtimes: this.#registries.runtimes.list(),
        surfaces: this.#registries.surfaces.list(),
        actions: this.#registries.actions.list(),
        locators: this.#registries.locators.list(),
        validators: this.#registries.validators.list(),
      };
    }

    const languageIds = new Set(profile.allowedLanguageIds);
    const surfaceIds = new Set(profile.allowedSurfaceIds);
    const actionIds = new Set(profile.allowedActionIds);
    const languages = this.#registries.languages
      .list()
      .filter(({ id }) => languageIds.has(id));
    const locatorIds = new Set(languages.flatMap(({ locatorIds }) => locatorIds));
    const validatorIds = new Set(
      languages.flatMap(({ validatorIds }) => validatorIds),
    );

    return {
      environmentProfiles: [profile],
      languages,
      runtimes: [this.#registries.runtimes.require(profile.runtimeProviderId)],
      surfaces: this.#registries.surfaces
        .list()
        .filter(({ id }) => surfaceIds.has(id)),
      actions: this.#registries.actions
        .list()
        .filter(({ id }) => actionIds.has(id)),
      locators: this.#registries.locators
        .list()
        .filter(({ id }) => locatorIds.has(id)),
      validators: this.#registries.validators
        .list()
        .filter(({ id }) => validatorIds.has(id)),
    };
  }

  #assertRegistryConsistency(): void {
    for (const language of this.#registries.languages.list()) {
      language.locatorIds.forEach((id) =>
        this.#requireReference(
          this.#registries.locators.get(id),
          `Language provider "${language.id}" references unknown locator "${id}".`,
        ),
      );
      language.validatorIds.forEach((id) =>
        this.#requireReference(
          this.#registries.validators.get(id),
          `Language provider "${language.id}" references unknown validator "${id}".`,
        ),
      );
    }

    for (const locator of this.#registries.locators.list()) {
      this.#requireReference(
        this.#registries.languages.get(locator.languageId),
        `Locator "${locator.id}" references unknown language "${locator.languageId}".`,
      );
    }

    for (const validator of this.#registries.validators.list()) {
      validator.supportedLanguageIds.forEach((id) =>
        this.#requireReference(
          this.#registries.languages.get(id),
          `Validator "${validator.id}" references unknown language "${id}".`,
        ),
      );
    }

    for (const runtime of this.#registries.runtimes.list()) {
      runtime.supportedLanguageIds.forEach((id) =>
        this.#requireReference(
          this.#registries.languages.get(id),
          `Runtime provider "${runtime.id}" references unknown language "${id}".`,
        ),
      );
      runtime.actionIds.forEach((id) =>
        this.#requireReference(
          this.#registries.actions.get(id),
          `Runtime provider "${runtime.id}" references unknown action "${id}".`,
        ),
      );
    }

    for (const surface of this.#registries.surfaces.list()) {
      surface.actionIds.forEach((id) =>
        this.#requireReference(
          this.#registries.actions.get(id),
          `Surface "${surface.id}" references unknown action "${id}".`,
        ),
      );
    }

    for (const profile of this.#registries.environmentProfiles.list()) {
      this.#requireReference(
        this.#registries.runtimes.get(profile.runtimeProviderId),
        `Environment profile "${profile.id}" references unknown runtime "${profile.runtimeProviderId}".`,
      );
      profile.allowedLanguageIds.forEach((id) =>
        this.#requireReference(
          this.#registries.languages.get(id),
          `Environment profile "${profile.id}" references unknown language "${id}".`,
        ),
      );
      profile.defaultLanguageIds.forEach((id) => {
        if (!profile.allowedLanguageIds.includes(id)) {
          throw new CapabilityCatalogConsistencyError(
            `Environment profile "${profile.id}" uses default language "${id}" outside its allowed languages.`,
          );
        }
      });
      profile.allowedSurfaceIds.forEach((id) =>
        this.#requireReference(
          this.#registries.surfaces.get(id),
          `Environment profile "${profile.id}" references unknown surface "${id}".`,
        ),
      );
      profile.defaultSurfaces.forEach(({ id }) => {
        if (!profile.allowedSurfaceIds.includes(id)) {
          throw new CapabilityCatalogConsistencyError(
            `Environment profile "${profile.id}" uses default surface "${id}" outside its allowed surfaces.`,
          );
        }
      });
      profile.allowedActionIds.forEach((id) =>
        this.#requireReference(
          this.#registries.actions.get(id),
          `Environment profile "${profile.id}" references unknown action "${id}".`,
        ),
      );
    }

    for (const action of this.#registries.actions.list()) {
      this.#assertActionOwner(action);
    }

    for (const resolver of this.#registries.targetResolvers.list()) {
      resolver.supportedEffectIds.forEach((id) =>
        this.#requireReference(
          this.#registries.guidance.effects.get(id),
          `Target resolver "${resolver.id}" references unknown effect "${id}".`,
        ),
      );
      resolver.supportedInteractionEventTypeIds.forEach((id) =>
        this.#requireReference(
          this.#registries.guidance.interactionEventTypes.get(id),
          `Target resolver "${resolver.id}" references unknown interaction event type "${id}".`,
        ),
      );
    }

    for (const anchor of this.#registries.interactionAnchors.list()) {
      if (anchor.surfaceId) {
        this.#requireReference(
          this.#registries.surfaces.get(anchor.surfaceId),
          `Interaction anchor "${anchor.id}" references unknown surface "${anchor.surfaceId}".`,
        );
      }
    }
  }

  #assertActionOwner(action: EnvironmentActionDefinition): void {
    const owner =
      action.ownerType === "runtime"
        ? this.#registries.runtimes.get(action.ownerId)
        : action.ownerType === "surface"
          ? this.#registries.surfaces.get(action.ownerId)
          : this.#registries.environmentProfiles.get(action.ownerId);
    this.#requireReference(
      owner,
      `Environment action "${action.id}" references unknown ${action.ownerType} owner "${action.ownerId}".`,
    );

    const ownerActionIds =
      action.ownerType === "profile"
        ? (owner as EnvironmentProfile).allowedActionIds
        : (owner as RuntimeProvider | SurfaceDefinition).actionIds;
    if (!ownerActionIds.includes(action.id)) {
      throw new CapabilityCatalogConsistencyError(
        `Environment action "${action.id}" is not declared by its ${action.ownerType} owner "${action.ownerId}".`,
      );
    }
  }

  #requireReference<T>(value: T | undefined, message: string): asserts value is T {
    if (value === undefined) {
      throw new CapabilityCatalogConsistencyError(message);
    }
  }
}

type CapabilityScope = {
  environmentProfiles: EnvironmentProfile[];
  languages: LanguageProvider[];
  runtimes: RuntimeProvider[];
  surfaces: SurfaceDefinition[];
  actions: EnvironmentActionDefinition[];
  locators: LocatorDefinition[];
  validators: ValidatorDefinition[];
};

function summarizeProfile(profile: EnvironmentProfile): EnvironmentProfileSummary {
  return {
    id: profile.id,
    displayName: profile.displayName,
    runtimeProviderId: profile.runtimeProviderId,
    languageIds: [...profile.allowedLanguageIds],
    defaultLanguageIds: [...profile.defaultLanguageIds],
    surfaceIds: [...profile.allowedSurfaceIds],
    actions: [...profile.allowedActionIds],
    ...(profile.limits ? { limits: { ...profile.limits } } : {}),
  };
}

function summarizeLanguage(
  language: LanguageProvider,
): LanguageProviderSummary {
  return {
    id: language.id,
    displayName: language.displayName,
    extensions: [...language.extensions],
    ...(language.monacoLanguageId
      ? { monacoLanguageId: language.monacoLanguageId }
      : {}),
    locators: [...language.locatorIds],
    validators: [...language.validatorIds],
  };
}

function summarizeRuntime(runtime: RuntimeProvider): RuntimeProviderSummary {
  return {
    id: runtime.id,
    displayName: runtime.displayName,
    languageIds: [...runtime.supportedLanguageIds],
    capabilities: { ...runtime.capabilities },
    actions: [...runtime.actionIds],
  };
}

function summarizeSurface(surface: SurfaceDefinition): SurfaceSummary {
  return {
    id: surface.id,
    displayName: surface.displayName,
    modes: [...surface.supportedModeIds],
    placements: [...surface.supportedPlacementIds],
    configurationOptions: surface.configurationOptions.map((option) => ({
      ...option,
      ...(option.allowedValues
        ? { allowedValues: [...option.allowedValues] }
        : {}),
    })),
    actions: [...surface.actionIds],
  };
}

function summarizeAction(
  action: EnvironmentActionDefinition,
): EnvironmentActionSummary {
  return {
    id: action.id,
    ownerType: action.ownerType,
    ownerId: action.ownerId,
    inputSchema: cloneSchema(action.inputSchema),
  };
}

function summarizeLocator(locator: LocatorDefinition): LocatorSummary {
  return {
    id: locator.id,
    displayName: locator.displayName,
    languageId: locator.languageId,
    inputSchema: cloneSchema(locator.inputSchema),
  };
}

function summarizeValidator(validator: ValidatorDefinition): ValidatorSummary {
  return {
    id: validator.id,
    displayName: validator.displayName,
    languageIds: [...validator.supportedLanguageIds],
    inputSchema: cloneSchema(validator.inputSchema),
  };
}

function summarizeTargetResolver(
  resolver: TargetResolverDefinition,
): TargetResolverSummary {
  return {
    id: resolver.id,
    displayName: resolver.displayName,
    inputSchema: cloneSchema(resolver.inputSchema),
    effects: [...resolver.supportedEffectIds],
    interactionEventTypes: [
      ...resolver.supportedInteractionEventTypeIds,
    ],
  };
}

function summarizeGuidanceEffect(
  effect: GuidanceEffectDefinition,
): GuidanceEffectSummary {
  return {
    id: effect.id,
    displayName: effect.displayName,
    inputSchema: cloneSchema(effect.inputSchema),
  };
}

function cloneSchema(schema: ClosedJsonObjectSchema): ClosedJsonObjectSchema {
  return structuredClone(schema);
}

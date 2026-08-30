import type {
  AssistantPlacementId,
  AssistantStateId,
  EnvironmentActionId,
  EnvironmentProfileId,
  GuidanceEffectId,
  InteractionAnchorId,
  InteractionEventTypeId,
  LanguageId,
  LocatorId,
  RuntimeProviderId,
  SurfaceId,
  SurfaceOptionId,
  TargetResolverId,
  ValidatorId,
} from "./identifiers";
import type { ClosedJsonObjectSchema, JsonValue } from "./json-schema";

export type SurfaceOptionValue = string | number | boolean;

export type EnvironmentActionOwnerType = "runtime" | "profile" | "surface";

export interface SystemLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxLessonSteps: number;
  maxSceneBeats: number;
  maxVisualGuideBodyCharacters: number;
  maxVisualGuideItems: number;
  maxVisualGuideItemCharacters: number;
  maxCaptionCharacters: number;
  maxTooltipCharacters: number;
  maxActivityEvents: number;
}

export const DEFAULT_SYSTEM_LIMITS: Readonly<SystemLimits> = Object.freeze({
  maxFiles: 8,
  maxFileBytes: 50 * 1024,
  maxLessonSteps: 10,
  maxSceneBeats: 12,
  maxVisualGuideBodyCharacters: 500,
  maxVisualGuideItems: 5,
  maxVisualGuideItemCharacters: 120,
  maxCaptionCharacters: 300,
  maxTooltipCharacters: 300,
  maxActivityEvents: 100,
});

export interface LocatorDefinition {
  id: LocatorId;
  displayName: string;
  languageId: LanguageId;
  inputSchema: ClosedJsonObjectSchema;
}

export interface ValidatorDefinition {
  id: ValidatorId;
  displayName: string;
  supportedLanguageIds: readonly LanguageId[];
  inputSchema: ClosedJsonObjectSchema;
}

export interface LanguageProvider {
  id: LanguageId;
  displayName: string;
  extensions: readonly string[];
  monacoLanguageId?: string;
  defaultFileNames?: readonly string[];
  locatorIds: readonly LocatorId[];
  validatorIds: readonly ValidatorId[];
}

export interface RuntimeCapabilities {
  preview: boolean;
  console: boolean;
  terminal: boolean;
  run: boolean;
  stop: boolean;
  restart: boolean;
  test: boolean;
  lint: boolean;
  format: boolean;
  packages: boolean;
  network: boolean;
}

export interface RuntimeProvider {
  id: RuntimeProviderId;
  displayName: string;
  supportedLanguageIds: readonly LanguageId[];
  capabilities: Readonly<RuntimeCapabilities>;
  actionIds: readonly EnvironmentActionId[];
}

export interface SurfaceOptionDefinition {
  id: SurfaceOptionId;
  valueType: "string" | "number" | "boolean";
  defaultValue?: SurfaceOptionValue;
  allowedValues?: readonly SurfaceOptionValue[];
  minimum?: number;
  maximum?: number;
}

export interface SurfaceDefinition {
  id: SurfaceId;
  displayName: string;
  supportedModeIds: readonly string[];
  supportedPlacementIds: readonly string[];
  configurationOptions: readonly SurfaceOptionDefinition[];
  actionIds: readonly EnvironmentActionId[];
}

export interface EnvironmentActionDefinition {
  id: EnvironmentActionId;
  ownerType: EnvironmentActionOwnerType;
  ownerId: string;
  inputSchema: ClosedJsonObjectSchema;
}

export interface WorkspaceFileTemplate {
  path: string;
  languageId: LanguageId;
  content: string;
  visible?: boolean;
  readOnly?: boolean;
}

export interface SurfaceConfigurationOption {
  optionId: SurfaceOptionId;
  value: SurfaceOptionValue;
}

export interface SurfaceConfiguration {
  id: SurfaceId;
  visible?: boolean;
  order?: number;
  placementId?: string;
  modeId?: string;
  size?: number;
  options?: readonly SurfaceConfigurationOption[];
}

export interface EnvironmentProfile {
  id: EnvironmentProfileId;
  displayName: string;
  runtimeProviderId: RuntimeProviderId;
  defaultLanguageIds: readonly LanguageId[];
  allowedLanguageIds: readonly LanguageId[];
  defaultFiles: readonly WorkspaceFileTemplate[];
  defaultSurfaces: readonly SurfaceConfiguration[];
  allowedSurfaceIds: readonly SurfaceId[];
  allowedActionIds: readonly EnvironmentActionId[];
  limits?: Partial<SystemLimits>;
}

export interface TargetResolverDefinition {
  id: TargetResolverId;
  displayName: string;
  inputSchema: ClosedJsonObjectSchema;
  supportedEffectIds: readonly GuidanceEffectId[];
  supportedInteractionEventTypeIds: readonly InteractionEventTypeId[];
}

export interface InteractionAnchorDefinition {
  id: InteractionAnchorId;
  displayName: string;
  surfaceId?: SurfaceId;
}

export interface GuidanceEffectDefinition {
  id: GuidanceEffectId;
  displayName: string;
  inputSchema: ClosedJsonObjectSchema;
}

export interface AssistantStateDefinition {
  id: AssistantStateId;
  displayName: string;
}

export interface AssistantPlacementDefinition {
  id: AssistantPlacementId;
  displayName: string;
  requiresTarget: boolean;
}

export interface InteractionEventTypeDefinition {
  id: InteractionEventTypeId;
  displayName: string;
}

export type TargetRef = {
  resolverId: TargetResolverId;
  input: Record<string, JsonValue>;
};

export type GuidanceEffectInput = {
  effectId: GuidanceEffectId;
  input?: Record<string, JsonValue>;
};

export type VisualGuideInput = {
  title?: string;
  body: string;
  supportingItems?: string[];
};

export type AssistantPresentationInput = {
  stateId: AssistantStateId;
  placementId?: AssistantPlacementId;
  visible?: boolean;
};

export type InteractionEvent = {
  id: string;
  typeId: InteractionEventTypeId;
  targetRef?: TargetRef;
  surfaceId?: SurfaceId;
  lessonStepId?: string;
  environmentRevision: number;
  occurredAt: string;
  summary?: string;
  outcome?: "observed" | "success" | "failure";
};

import type {
  EnvironmentProfileId,
  InteractionEventTypeId,
  LanguageId,
  RuntimeProviderId,
  SurfaceId,
  SurfaceOptionId,
} from "@/core/platform/identifiers";
import type {
  InteractionEvent,
  SurfaceConfiguration,
  SurfaceOptionValue,
} from "@/core/platform/contracts";

export type WorkspaceStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "running"
  | "stopped"
  | "error";

export type RuntimeStatus =
  | "idle"
  | "preparing"
  | "running"
  | "ready"
  | "stopped"
  | "error";

export type ConsoleEntryKind =
  | "log"
  | "info"
  | "warn"
  | "error"
  | "runtime"
  | "build";

export interface WorkspaceFile {
  path: string;
  languageId: LanguageId;
  content: string;
  visible: boolean;
  readOnly?: boolean;
}

export interface SurfaceState {
  id: SurfaceId;
  visible: boolean;
  order: number;
  placementId?: string;
  modeId?: string;
  size?: number;
  options: Readonly<Record<SurfaceOptionId, SurfaceOptionValue>>;
}

export interface ConsoleEntry {
  id: string;
  kind: ConsoleEntryKind;
  message: string;
  occurredAt: string;
}

export interface RuntimeState {
  providerId?: RuntimeProviderId;
  status: RuntimeStatus;
  revision: number;
  automaticExecutionEnabled?: boolean;
  errorMessage?: string;
}

export interface WorkspaceState {
  status: WorkspaceStatus;
  profileId?: EnvironmentProfileId;
  runtimeProviderId?: RuntimeProviderId;
  languageIds: readonly LanguageId[];
  files: readonly WorkspaceFile[];
  directories: readonly string[];
  surfaces: readonly SurfaceState[];
  activeSurfaceId?: SurfaceId;
  activeFilePath?: string;
  consoleEntries: readonly ConsoleEntry[];
  interactionEvents: readonly InteractionEvent[];
  runtime: RuntimeState;
  environmentRevision: number;
  errorMessage?: string;
}

export interface WorkspaceEnvironmentConfiguration {
  profileId: EnvironmentProfileId;
  runtimeProviderId: RuntimeProviderId;
  languageIds: readonly LanguageId[];
  files: readonly WorkspaceFile[];
  directories?: readonly string[];
  surfaces: readonly SurfaceConfiguration[];
  activeFilePath?: string;
  activeSurfaceId?: SurfaceId;
  focusActiveSurface?: boolean;
  clearConsole?: boolean;
  automaticExecutionEnabled?: boolean;
}

export type WorkspaceFileOperation =
  | { type: "create"; file: WorkspaceFile }
  | { type: "update"; path: string; content: string }
  | { type: "delete"; path: string };

export type RuntimeSnapshot = {
  providerId: RuntimeProviderId;
  status: RuntimeStatus;
  revision: number;
  files: readonly WorkspaceFile[];
  automaticExecutionEnabled?: boolean;
  errorMessage?: string;
};

export type SurfaceSnapshot = {
  surfaceId: SurfaceId;
  configuration?: SurfaceState;
};

export type EnvironmentActionResult = {
  actionId: string;
  accepted: boolean;
  message: string;
};

export type NormalizedInteractionInput = {
  id: string;
  typeId: InteractionEventTypeId;
  surfaceId?: SurfaceId;
  occurredAt: string;
  summary?: string;
};

export function createIdleWorkspaceState(): WorkspaceState {
  return {
    status: "idle",
    languageIds: [],
    files: [],
    directories: [],
    surfaces: [],
    consoleEntries: [],
    interactionEvents: [],
    runtime: {
      status: "idle",
      revision: 0,
    },
    environmentRevision: 0,
  };
}

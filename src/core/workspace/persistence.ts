import type {
  SurfaceOptionValue,
} from "@/core/platform/contracts";

import {
  createIdleWorkspaceState,
  type SurfaceState,
  type WorkspaceFile,
  type WorkspaceState,
} from "./contracts";
import { deriveWorkspaceDirectories } from "./workspace-entry-paths";

const PERSISTENCE_VERSION = 2;
const MAX_PERSISTED_BYTES = 1_000_000;

export interface WorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type PersistedWorkspace = {
  version: typeof PERSISTENCE_VERSION;
  profileId: string;
  runtimeProviderId: string;
  languageIds: string[];
  files: WorkspaceFile[];
  directories: string[];
  surfaces: SurfaceState[];
  activeSurfaceId?: string;
  activeFilePath?: string;
  environmentRevision: number;
};

export class WorkspacePersistence {
  readonly #storage: WorkspaceStorage;
  readonly #key: string;

  constructor(
    storage: WorkspaceStorage,
    key = "lessonique.workspace.v1",
  ) {
    this.#storage = storage;
    this.#key = key;
  }

  save(state: WorkspaceState): boolean {
    if (!state.profileId || !state.runtimeProviderId) {
      return false;
    }
    const persisted: PersistedWorkspace = {
      version: PERSISTENCE_VERSION,
      profileId: state.profileId,
      runtimeProviderId: state.runtimeProviderId,
      languageIds: [...state.languageIds],
      files: state.files.map((file) => ({ ...file })),
      directories: [...state.directories],
      surfaces: state.surfaces.map((surface) => ({
        ...surface,
        options: { ...surface.options },
      })),
      ...(state.activeSurfaceId
        ? { activeSurfaceId: state.activeSurfaceId }
        : {}),
      ...(state.activeFilePath ? { activeFilePath: state.activeFilePath } : {}),
      environmentRevision: state.environmentRevision,
    };
    try {
      this.#storage.setItem(this.#key, JSON.stringify(persisted));
      return true;
    } catch {
      return false;
    }
  }

  load(): WorkspaceState | undefined {
    try {
      const serialized = this.#storage.getItem(this.#key);
      if (!serialized || serialized.length > MAX_PERSISTED_BYTES) {
        return undefined;
      }
      return parsePersistedWorkspace(JSON.parse(serialized));
    } catch {
      return undefined;
    }
  }

  clear(): boolean {
    try {
      this.#storage.removeItem(this.#key);
      return true;
    } catch {
      return false;
    }
  }
}

function parsePersistedWorkspace(value: unknown): WorkspaceState | undefined {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) {
    return undefined;
  }
  if (
    typeof value.profileId !== "string" ||
    typeof value.runtimeProviderId !== "string" ||
    !isStringArray(value.languageIds) ||
    !Array.isArray(value.files) ||
    (value.version === PERSISTENCE_VERSION && !isStringArray(value.directories)) ||
    !Array.isArray(value.surfaces) ||
    !Number.isInteger(value.environmentRevision) ||
    Number(value.environmentRevision) < 0
  ) {
    return undefined;
  }
  const files = value.files.map(parseFile);
  const surfaces = value.surfaces.map(parseSurface);
  if (files.some((file) => !file) || surfaces.some((surface) => !surface)) {
    return undefined;
  }
  if (
    (value.activeFilePath !== undefined &&
      typeof value.activeFilePath !== "string") ||
    (value.activeSurfaceId !== undefined &&
      typeof value.activeSurfaceId !== "string")
  ) {
    return undefined;
  }
  const idle = createIdleWorkspaceState();
  return {
    ...idle,
    status: "ready",
    profileId: value.profileId,
    runtimeProviderId: value.runtimeProviderId,
    languageIds: [...value.languageIds],
    files: files as WorkspaceFile[],
    directories: deriveWorkspaceDirectories(
      files as WorkspaceFile[],
      isStringArray(value.directories) ? value.directories : [],
    ),
    surfaces: surfaces as SurfaceState[],
    ...(value.activeSurfaceId
      ? { activeSurfaceId: value.activeSurfaceId }
      : {}),
    ...(value.activeFilePath ? { activeFilePath: value.activeFilePath } : {}),
    environmentRevision: value.environmentRevision as number,
  };
}

function parseFile(value: unknown): WorkspaceFile | undefined {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.languageId !== "string" ||
    typeof value.content !== "string" ||
    typeof value.visible !== "boolean" ||
    (value.readOnly !== undefined && typeof value.readOnly !== "boolean")
  ) {
    return undefined;
  }
  return {
    path: value.path,
    languageId: value.languageId,
    content: value.content,
    visible: value.visible,
    ...(value.readOnly === true ? { readOnly: true } : {}),
  };
}

function parseSurface(value: unknown): SurfaceState | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.visible !== "boolean" ||
    !Number.isInteger(value.order) ||
    !isRecord(value.options) ||
    (value.modeId !== undefined && typeof value.modeId !== "string") ||
    (value.placementId !== undefined && typeof value.placementId !== "string") ||
    (value.size !== undefined &&
      (typeof value.size !== "number" || !Number.isFinite(value.size)))
  ) {
    return undefined;
  }
  const options: Record<string, SurfaceOptionValue> = {};
  for (const [optionId, optionValue] of Object.entries(value.options)) {
    if (!isSurfaceOptionValue(optionValue)) {
      return undefined;
    }
    options[optionId] = optionValue;
  }
  return {
    id: value.id,
    visible: value.visible,
    order: value.order as number,
    ...(typeof value.placementId === "string"
      ? { placementId: value.placementId }
      : {}),
    ...(typeof value.modeId === "string" ? { modeId: value.modeId } : {}),
    ...(typeof value.size === "number" ? { size: value.size } : {}),
    options,
  };
}

function isSurfaceOptionValue(value: unknown): value is SurfaceOptionValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

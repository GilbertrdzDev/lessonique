import type {
  EnvironmentActionId,
  SurfaceId,
} from "@/core/platform/identifiers";

import type {
  EnvironmentActionResult,
  SurfaceSnapshot,
  SurfaceState,
} from "./contracts";

export interface SurfaceAdapter {
  readonly surfaceId: SurfaceId;
  configure(configuration: SurfaceState): Promise<void>;
  executeAction(
    actionId: EnvironmentActionId,
    input?: unknown,
  ): Promise<EnvironmentActionResult>;
  getSnapshot(): SurfaceSnapshot;
}

export class DuplicateSurfaceAdapterError extends Error {
  constructor(surfaceId: SurfaceId) {
    super(`Surface adapter "${surfaceId}" is already registered.`);
    this.name = "DuplicateSurfaceAdapterError";
  }
}

export class MissingSurfaceAdapterError extends Error {
  constructor(surfaceId: SurfaceId) {
    super(`Surface adapter "${surfaceId}" is not registered.`);
    this.name = "MissingSurfaceAdapterError";
  }
}

export class SurfaceAdapterRegistry {
  readonly #adapters = new Map<SurfaceId, SurfaceAdapter>();

  register(adapter: SurfaceAdapter): void {
    if (this.#adapters.has(adapter.surfaceId)) {
      throw new DuplicateSurfaceAdapterError(adapter.surfaceId);
    }
    this.#adapters.set(adapter.surfaceId, adapter);
  }

  get(surfaceId: SurfaceId): SurfaceAdapter | undefined {
    return this.#adapters.get(surfaceId);
  }

  require(surfaceId: SurfaceId): SurfaceAdapter {
    const adapter = this.get(surfaceId);
    if (!adapter) {
      throw new MissingSurfaceAdapterError(surfaceId);
    }
    return adapter;
  }

  list(): SurfaceAdapter[] {
    return [...this.#adapters.values()];
  }
}

export class InMemorySurfaceAdapter implements SurfaceAdapter {
  readonly surfaceId: SurfaceId;
  #configuration?: SurfaceState;

  constructor(surfaceId: SurfaceId) {
    this.surfaceId = surfaceId;
  }

  async configure(configuration: SurfaceState): Promise<void> {
    this.#configuration = cloneSurface(configuration);
  }

  async executeAction(
    actionId: EnvironmentActionId,
  ): Promise<EnvironmentActionResult> {
    return {
      actionId,
      accepted: false,
      message: `Surface "${this.surfaceId}" does not implement action "${actionId}".`,
    };
  }

  getSnapshot(): SurfaceSnapshot {
    return {
      surfaceId: this.surfaceId,
      ...(this.#configuration
        ? { configuration: cloneSurface(this.#configuration) }
        : {}),
    };
  }
}

export function cloneSurface(surface: SurfaceState): SurfaceState {
  return { ...surface, options: { ...surface.options } };
}

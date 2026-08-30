import type {
  InteractionEvent,
  TargetRef,
} from "@/core/platform/contracts";
import type { TargetResolverId } from "@/core/platform/identifiers";

export interface TargetGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ResolvedTargetSnapshot =
  | { status: "resolved"; geometry: TargetGeometry }
  | { status: "lost" };

export interface ResolvedTargetHandle {
  getSnapshot(): ResolvedTargetSnapshot;
  subscribe(listener: (snapshot: ResolvedTargetSnapshot) => void): () => void;
  dispose(): void;
}

export interface GuidanceTargetAdapter {
  supportsTargetResolver(resolverId: TargetResolverId): boolean;
  prepareTarget(target: TargetRef, signal: AbortSignal): Promise<void>;
  resolveTarget(
    target: TargetRef,
    signal: AbortSignal,
  ): Promise<ResolvedTargetHandle>;
}

export type InteractionEventListener = (event: InteractionEvent) => void;

export interface InteractionSourceAdapter {
  subscribeToInteractions(
    listener: InteractionEventListener,
    signal: AbortSignal,
  ): void;
}

export class ObservableTargetHandle implements ResolvedTargetHandle {
  #snapshot: ResolvedTargetSnapshot;
  readonly #listeners = new Set<(snapshot: ResolvedTargetSnapshot) => void>();
  #disposed = false;

  constructor(initialSnapshot: ResolvedTargetSnapshot) {
    this.#snapshot = initialSnapshot;
  }

  getSnapshot(): ResolvedTargetSnapshot {
    return cloneTargetSnapshot(this.#snapshot);
  }

  subscribe(listener: (snapshot: ResolvedTargetSnapshot) => void): () => void {
    if (this.#disposed) {
      return () => undefined;
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  update(snapshot: ResolvedTargetSnapshot): void {
    if (this.#disposed || targetSnapshotsEqual(this.#snapshot, snapshot)) {
      return;
    }
    this.#snapshot = cloneTargetSnapshot(snapshot);
    this.#listeners.forEach((listener) => listener(this.getSnapshot()));
  }

  dispose(): void {
    this.#disposed = true;
    this.#listeners.clear();
  }
}

function cloneTargetSnapshot(
  snapshot: ResolvedTargetSnapshot,
): ResolvedTargetSnapshot {
  return snapshot.status === "resolved"
    ? { status: "resolved", geometry: { ...snapshot.geometry } }
    : { status: "lost" };
}

function targetSnapshotsEqual(
  left: ResolvedTargetSnapshot,
  right: ResolvedTargetSnapshot,
): boolean {
  if (left.status !== right.status) {
    return false;
  }
  if (left.status === "lost" || right.status === "lost") {
    return true;
  }
  return (
    left.geometry.left === right.geometry.left &&
    left.geometry.top === right.geometry.top &&
    left.geometry.width === right.geometry.width &&
    left.geometry.height === right.geometry.height
  );
}

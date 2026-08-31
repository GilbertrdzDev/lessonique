import type {
  GuidanceEffectInput,
  TargetRef,
  VisualGuideInput,
} from "@/core/platform/contracts";
import type { AssistantPlacementId, AssistantStateId } from "@/core/platform/identifiers";
import type { ResolvedTargetSnapshot, TargetGeometry } from "@/core/workspace/targeting";

import type { AssistantActorStatus, SceneSnapshot } from "./contracts";

export type ScenePresentationPosition = {
  left: number;
  top: number;
  docked: boolean;
};

export interface ScenePresentationSnapshot {
  sceneId?: string;
  beatId?: string;
  target?: TargetRef;
  targetSnapshot?: ResolvedTargetSnapshot;
  assistant: {
    stateId: AssistantStateId;
    placementId?: AssistantPlacementId;
    visible: boolean;
    status: AssistantActorStatus;
    position: ScenePresentationPosition;
    reducedMotion: boolean;
  };
  effects: readonly GuidanceEffectInput[];
  guide?: VisualGuideInput;
  caption?: string;
  hint?: string;
  paused: boolean;
}

type StoreListener = () => void;

const IDLE_ASSISTANT_STATE_ID = "assistant.idle";

export class SceneStore {
  #snapshot: SceneSnapshot = createIdleSceneSnapshot();
  readonly #listeners = new Set<StoreListener>();

  getSnapshot = (): SceneSnapshot => this.#snapshot;

  subscribe = (listener: StoreListener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  commit(snapshot: SceneSnapshot): void {
    this.#snapshot = structuredClone(snapshot);
    this.#listeners.forEach((listener) => listener());
  }
}

export class ScenePresentationStore {
  #snapshot: ScenePresentationSnapshot = createIdlePresentationSnapshot();
  readonly #listeners = new Set<StoreListener>();

  getSnapshot = (): ScenePresentationSnapshot => this.#snapshot;

  subscribe = (listener: StoreListener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  commit(snapshot: ScenePresentationSnapshot): void {
    this.#snapshot = structuredClone(snapshot);
    this.#listeners.forEach((listener) => listener());
  }

  patch(
    update: (
      current: ScenePresentationSnapshot,
    ) => ScenePresentationSnapshot,
  ): void {
    this.commit(update(this.getSnapshot()));
  }

  clear(options: { reducedMotion?: boolean } = {}): void {
    this.commit(createIdlePresentationSnapshot(options.reducedMotion));
  }
}

export function createIdleSceneSnapshot(): SceneSnapshot {
  return {
    status: "idle",
    assistant: {
      stateId: IDLE_ASSISTANT_STATE_ID,
      visible: false,
      status: "idle",
    },
    revision: 0,
  };
}

export function createIdlePresentationSnapshot(
  reducedMotion = false,
): ScenePresentationSnapshot {
  return {
    assistant: {
      stateId: IDLE_ASSISTANT_STATE_ID,
      visible: false,
      status: "idle",
      position: { left: 24, top: 24, docked: true },
      reducedMotion,
    },
    effects: [],
    paused: false,
  };
}

export function targetGeometryFromPresentation(
  snapshot: ScenePresentationSnapshot,
): TargetGeometry | undefined {
  return snapshot.targetSnapshot?.status === "resolved"
    ? { ...snapshot.targetSnapshot.geometry }
    : undefined;
}

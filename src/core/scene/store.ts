import type {
  GuidanceEffectInput,
  TargetRef,
  VisualGuideInput,
} from "@/core/platform/contracts";
import type { AssistantPlacementId, AssistantStateId } from "@/core/platform/identifiers";
import type { ResolvedTargetSnapshot, TargetGeometry } from "@/core/workspace/targeting";

import type { AssistantActorStatus, SceneSnapshot } from "./contracts";

export type ScenePresentationPhase =
  | "teaching"
  | "interaction"
  | "validating"
  | "feedback"
  | "completed";

export type SceneNavigationSnapshot = {
  enabled: boolean;
  current: number;
  total: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  nextBlocked: boolean;
  transitioning: boolean;
  exerciseValidation?: {
    status: "idle" | "validating" | "passed" | "failed" | "error";
    message?: string;
  };
};

export type ScenePresentationVisibility =
  | "visible"
  | "out-of-view"
  | "hidden-by-user"
  | "transitioning";

export type ScenePresentationSide = "left" | "right" | "above" | "below" | "docked";
export type ScenePresentationFacing = "left" | "right";

export type ScenePresentationPosition = {
  left: number;
  top: number;
  docked: boolean;
  side: ScenePresentationSide;
  facing: ScenePresentationFacing;
  companionOffsetLeft: number;
  companionOffsetTop: number;
  guideOffsetLeft: number;
  guideOffsetTop: number;
  companionSuppressed?: boolean;
  guideSuppressed?: boolean;
};

export interface ScenePresentationSnapshot {
  generation: number;
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
  phase: ScenePresentationPhase;
  navigation: SceneNavigationSnapshot;
  paused: boolean;
  visibility: ScenePresentationVisibility;
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
    generation: 0,
    assistant: {
      stateId: IDLE_ASSISTANT_STATE_ID,
      visible: false,
      status: "idle",
      position: {
        left: 24,
        top: 24,
        docked: true,
        side: "docked",
        facing: "left",
        companionOffsetLeft: 0,
        companionOffsetTop: 0,
        guideOffsetLeft: 0,
        guideOffsetTop: 0,
        companionSuppressed: false,
        guideSuppressed: false,
      },
      reducedMotion,
    },
    effects: [],
    phase: "completed",
    navigation: {
      enabled: false,
      current: 0,
      total: 0,
      canGoPrevious: false,
      canGoNext: false,
      nextBlocked: false,
      transitioning: false,
    },
    paused: false,
    visibility: "visible",
  };
}

export function targetGeometryFromPresentation(
  snapshot: ScenePresentationSnapshot,
): TargetGeometry | undefined {
  return snapshot.targetSnapshot?.status === "resolved"
    ? { ...snapshot.targetSnapshot.geometry }
    : undefined;
}

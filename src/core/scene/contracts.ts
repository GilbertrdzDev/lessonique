import type {
  AssistantPresentationInput,
  GuidanceEffectInput,
  InteractionEvent,
  TargetRef,
  VisualGuideInput,
} from "@/core/platform/contracts";
import type {
  AssistantStateId,
  SurfaceId,
} from "@/core/platform/identifiers";
import type { LocalWaitCondition } from "@/core/lesson/contracts";

export type SceneId = string;
export type SceneBeatId = string;

export type SceneStatus =
  | "idle"
  | "preparing"
  | "playing"
  | "paused"
  | "waiting"
  | "completed"
  | "cancelled"
  | "failed";

export type AssistantActorStatus =
  | "idle"
  | "moving"
  | "presenting"
  | "waiting";

export type TargetLossRecovery = "wait" | "retry" | "skip" | "cancel";

export interface ScenePreparation {
  surfaceId?: SurfaceId;
  filePath?: string;
  viewportId?: string;
  scroll?: "none" | "if-needed";
}

export interface TeachingSceneBeat {
  id: SceneBeatId;
  prepare?: ScenePreparation;
  target?: TargetRef;
  targetLossRecovery?: TargetLossRecovery;
  assistant?: AssistantPresentationInput;
  effects: readonly GuidanceEffectInput[];
  guide?: VisualGuideInput;
  caption?: string;
  wait?: LocalWaitCondition;
}

export interface TeachingScene {
  id: SceneId;
  title?: string;
  cleanupPolicy: "replace";
  allowManualNavigation: boolean;
  beats: readonly TeachingSceneBeat[];
}

export interface AssistantSnapshot {
  stateId: AssistantStateId;
  visible: boolean;
  sceneId?: SceneId;
  beatId?: SceneBeatId;
  target?: TargetRef;
  status: AssistantActorStatus;
}

export interface SceneSnapshot {
  id?: SceneId;
  status: SceneStatus;
  activeBeatId?: SceneBeatId;
  activeBeatIndex?: number;
  target?: TargetRef;
  wait?: LocalWaitCondition;
  assistant: AssistantSnapshot;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  revision: number;
}

export type SceneInteractionEvent = InteractionEvent;

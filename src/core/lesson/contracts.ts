import type {
  AssistantStateId,
  InteractionEventTypeId,
  ValidatorId,
} from "@/core/platform/identifiers";
import type {
  InteractionEvent,
  TargetRef,
} from "@/core/platform/contracts";
import type { JsonValue } from "@/core/platform/json-schema";

export type LessonId = string;
export type LessonStepId = string;
export type LessonCriterionId = string;
export type LessonAttemptId = string;
export type LessonEventTypeId = string;
export type LocalWaitId = string;
export type LessonMode = "explain" | "practice" | "mixed";

export type LessonLifecycleStatus =
  | "idle"
  | "preparing"
  | "active"
  | "completed"
  | "failed";

export type LessonStepStatus =
  | "pending"
  | "active"
  | "completed"
  | "failed"
  | "locked";

export type LessonAttemptOutcome = "pending" | "passed" | "failed";
export type LessonEventSource = "agent" | "learner" | "system";
export type LessonEventOutcome =
  | "informational"
  | "success"
  | "warning"
  | "failure";
export type LessonAgentStatus = "idle" | "working" | "waiting" | "error";
export type LocalWaitStatus =
  | "pending"
  | "satisfied"
  | "timed-out"
  | "cancelled";

export interface LessonDefinition {
  id: LessonId;
  title: string;
  objective: string;
  mode?: LessonMode;
  description?: string;
  locale?: string;
}

export interface LessonCriterion {
  id: LessonCriterionId;
  validatorId: ValidatorId;
  input?: Readonly<Record<string, JsonValue>>;
}

export interface LessonStepDefinition {
  id: LessonStepId;
  title: string;
  objective: string;
  instructions?: string;
  criteria: readonly LessonCriterion[];
  hints: readonly string[];
}

export interface LessonStepPatch {
  title?: string;
  objective?: string;
  instructions?: string;
  criteria?: readonly LessonCriterion[];
  hints?: readonly string[];
}

export type LessonPlanOperation =
  | { type: "replace_steps"; steps: readonly LessonStepDefinition[] }
  | {
      type: "insert_step";
      step: LessonStepDefinition;
      afterStepId?: LessonStepId;
    }
  | { type: "update_step"; stepId: LessonStepId; patch: LessonStepPatch }
  | { type: "remove_step"; stepId: LessonStepId }
  | { type: "set_active_step"; stepId: LessonStepId }
  | { type: "set_agent_message"; message: string };

export interface LessonAttempt {
  id: LessonAttemptId;
  outcome: LessonAttemptOutcome;
  occurredAt: string;
  evidenceSummary?: string;
}

export interface LessonStepState extends LessonStepDefinition {
  status: LessonStepStatus;
  attempts: readonly LessonAttempt[];
  revealedHintCount: number;
}

export interface LessonPlanState {
  steps: readonly LessonStepState[];
  activeStepId?: LessonStepId;
  revision: number;
}

export interface LessonProgress {
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  percentage: number;
}

export interface LessonEvent {
  id: string;
  typeId: LessonEventTypeId;
  occurredAt: string;
  lessonId?: LessonId;
  lessonStepId?: LessonStepId;
  outcome?: LessonEventOutcome;
  summary?: string;
}

export interface LessonActivityEntry extends LessonEvent {
  source: LessonEventSource;
}

export type NormalizedInteractionEvent = InteractionEvent;

export type LocalWaitCondition =
  | {
      kind: "interaction";
      eventTypeId: InteractionEventTypeId;
      target?: TargetRef;
      lessonStepId?: LessonStepId;
      timeoutMs?: number;
    }
  | {
      kind: "validation";
      criterionId: LessonCriterionId;
      lessonStepId?: LessonStepId;
      timeoutMs?: number;
    };

export interface LocalWaitState {
  id: LocalWaitId;
  condition: LocalWaitCondition;
  status: LocalWaitStatus;
  startedAt: string;
  timeoutAt?: string;
  resolvedAt?: string;
  resolvedByEventId?: string;
}

export interface AssistantIntent {
  stateId: AssistantStateId;
  occurredAt: string;
  lessonStepId?: LessonStepId;
  reasonEventId?: string;
}

export interface LessonAgentState {
  status: LessonAgentStatus;
  message?: string;
  assistantIntent?: AssistantIntent;
}

export interface LessonState {
  status: LessonLifecycleStatus;
  lesson?: LessonDefinition;
  plan: LessonPlanState;
  progress: LessonProgress;
  agent: LessonAgentState;
  activity: readonly LessonActivityEntry[];
  interactions: readonly NormalizedInteractionEvent[];
  waits: readonly LocalWaitState[];
  revision: number;
  errorMessage?: string;
}

export type LessonStateListener = () => void;

export interface LessonStateReader {
  getSnapshot(): LessonState;
  subscribe(listener: LessonStateListener): () => void;
}

export interface LessonStateWriter {
  commit(nextState: LessonState): void;
}

export interface LessonStoreAdapter extends LessonStateReader, LessonStateWriter {}

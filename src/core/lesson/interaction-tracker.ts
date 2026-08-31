import {
  DEFAULT_SYSTEM_LIMITS,
  type InteractionEvent,
  type TargetRef,
} from "@/core/platform/contracts";
import type { AssistantStateId } from "@/core/platform/identifiers";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import type { InteractionSourceAdapter } from "@/core/workspace/targeting";

import { normalizeInteractionForHistory } from "./activity";
import type {
  AssistantIntent,
  LocalWaitCondition,
  LocalWaitState,
  LessonAgentState,
  LessonStoreAdapter,
  NormalizedInteractionEvent,
} from "./contracts";
import type { ClassroomLifecycleService } from "./lifecycle";

export type InteractionWaitResult = {
  status: "satisfied" | "timed-out" | "cancelled";
  event?: NormalizedInteractionEvent;
};

export interface AssistantIntentStateIds {
  thinking: AssistantStateId;
  success: AssistantStateId;
  warning: AssistantStateId;
}

export class AssistantIntentMapper {
  readonly #stateIds: AssistantIntentStateIds;
  readonly #now: () => string;

  constructor(
    platform: ProviderPlatformRegistries,
    stateIds: AssistantIntentStateIds,
    now: () => string = () => new Date().toISOString(),
  ) {
    Object.values(stateIds).forEach((stateId) =>
      platform.guidance.assistantStates.require(stateId),
    );
    this.#stateIds = stateIds;
    this.#now = now;
  }

  thinking(lessonStepId?: string): AssistantIntent {
    return this.#create(this.#stateIds.thinking, lessonStepId);
  }

  fromOutcome(
    outcome: InteractionEvent["outcome"],
    reasonEventId: string,
    lessonStepId?: string,
  ): AssistantIntent | undefined {
    if (outcome !== "success" && outcome !== "failure") return undefined;
    return {
      ...this.#create(
        outcome === "success" ? this.#stateIds.success : this.#stateIds.warning,
        lessonStepId,
      ),
      reasonEventId,
    };
  }

  satisfied(
    event: InteractionEvent,
    lessonStepId?: string,
  ): AssistantIntent {
    return {
      ...this.#create(
        event.outcome === "failure" ? this.#stateIds.warning : this.#stateIds.success,
        lessonStepId ?? event.lessonStepId,
      ),
      reasonEventId: event.id,
    };
  }

  #create(stateId: AssistantStateId, lessonStepId?: string): AssistantIntent {
    return {
      stateId,
      occurredAt: this.#now(),
      ...(lessonStepId ? { lessonStepId } : {}),
    };
  }
}

export interface InteractionTrackerOptions {
  store: LessonStoreAdapter;
  platform: ProviderPlatformRegistries;
  lifecycle: ClassroomLifecycleService;
  assistantIntents: AssistantIntentMapper;
  getEnvironmentRevision(): number;
  onInteraction?(event: NormalizedInteractionEvent): void;
  now?: () => string;
}

type PendingWait = {
  id: string;
  condition: Extract<LocalWaitCondition, { kind: "interaction" }>;
  finish(result: InteractionWaitResult): void;
};

export class InteractionTracker {
  readonly #store: LessonStoreAdapter;
  readonly #platform: ProviderPlatformRegistries;
  readonly #lifecycle: ClassroomLifecycleService;
  readonly #assistantIntents: AssistantIntentMapper;
  readonly #getEnvironmentRevision: () => number;
  readonly #onInteraction?: (event: NormalizedInteractionEvent) => void;
  readonly #now: () => string;
  readonly #waits = new Map<string, PendingWait>();
  #sourceController?: AbortController;

  constructor(options: InteractionTrackerOptions) {
    this.#store = options.store;
    this.#platform = options.platform;
    this.#lifecycle = options.lifecycle;
    this.#assistantIntents = options.assistantIntents;
    this.#getEnvironmentRevision = options.getEnvironmentRevision;
    this.#onInteraction = options.onInteraction;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  attachSources(sources: readonly InteractionSourceAdapter[]): void {
    this.detachSources();
    const controller = new AbortController();
    sources.forEach((source) =>
      source.subscribeToInteractions(
        (event) => this.record(event),
        controller.signal,
      ),
    );
    this.#sourceController = controller;
  }

  detachSources(): void {
    this.#sourceController?.abort();
    this.#sourceController = undefined;
  }

  record(event: InteractionEvent): NormalizedInteractionEvent | undefined {
    const normalized = this.#validateAndNormalize(event);
    if (!normalized) return undefined;
    this.#onInteraction?.(normalized);
    const state = this.#store.getSnapshot();
    const interactions = [
      ...state.interactions.filter(({ id }) => id !== normalized.id),
      normalized,
    ].slice(-DEFAULT_SYSTEM_LIMITS.maxActivityEvents);
    const activity = [
      ...state.activity.filter(({ id }) => id !== normalized.id),
      {
        id: normalized.id,
        typeId: normalized.typeId,
        source: "learner" as const,
        occurredAt: normalized.occurredAt,
        ...(normalized.lessonStepId
          ? { lessonStepId: normalized.lessonStepId }
          : {}),
        ...(normalized.outcome === "success"
          ? { outcome: "success" as const }
          : normalized.outcome === "failure"
            ? { outcome: "failure" as const }
            : {}),
        ...(normalized.summary ? { summary: normalized.summary } : {}),
      },
    ].slice(-DEFAULT_SYSTEM_LIMITS.maxActivityEvents);
    const intent = this.#assistantIntents.fromOutcome(
      normalized.outcome,
      normalized.id,
      normalized.lessonStepId,
    );
    this.#store.commit({
      ...state,
      interactions,
      activity,
      agent: intent
        ? { status: "working", assistantIntent: intent }
        : state.agent,
      revision: state.revision + 1,
    });

    [...this.#waits.values()].forEach((wait) => {
      if (matchesInteraction(wait.condition, normalized)) {
        wait.finish({ status: "satisfied", event: normalized });
      }
    });
    return normalized;
  }

  waitFor(
    id: string,
    condition: Extract<LocalWaitCondition, { kind: "interaction" }>,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<InteractionWaitResult> {
    if (this.#waits.has(id)) {
      throw new Error(`Interaction wait "${id}" is already active.`);
    }
    this.#platform.guidance.interactionEventTypes.require(condition.eventTypeId);
    if (condition.target) this.#platform.targetResolvers.validateReference(condition.target);
    const timeoutMs = condition.timeoutMs ?? 30_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300_000) {
      throw new RangeError("Interaction wait timeout must be between 1 and 300000 milliseconds.");
    }
    if (signal.aborted) {
      return Promise.resolve({ status: "cancelled" });
    }

    const startedAt = this.#now();
    this.#commitWait({
      id,
      condition,
      status: "pending",
      startedAt,
      timeoutAt: new Date(Date.parse(startedAt) + timeoutMs).toISOString(),
    }, {
      status: "waiting",
      assistantIntent: this.#assistantIntents.thinking(condition.lessonStepId),
    });

    return new Promise<InteractionWaitResult>((resolve) => {
      let settled = false;
      const releaseLifecycle = this.#lifecycle.register({
        id,
        kind: "wait",
        dispose: () => finish({ status: "cancelled" }),
      });
      const timer = setTimeout(
        () => finish({ status: "timed-out" }),
        timeoutMs,
      );
      const cancel = () => finish({ status: "cancelled" });
      const finish = (result: InteractionWaitResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        this.#waits.delete(id);
        releaseLifecycle();
        this.#resolveWait(id, condition, result);
        resolve(result);
      };
      this.#waits.set(id, { id, condition, finish });
      signal.addEventListener("abort", cancel, { once: true });
    });
  }

  #validateAndNormalize(
    event: InteractionEvent,
  ): NormalizedInteractionEvent | undefined {
    if (event.environmentRevision !== this.#getEnvironmentRevision()) {
      return undefined;
    }
    this.#platform.guidance.interactionEventTypes.require(event.typeId);
    if (event.targetRef) {
      const resolver = this.#platform.targetResolvers.validateReference(event.targetRef);
      if (!resolver.supportedInteractionEventTypeIds.includes(event.typeId)) {
        throw new Error(
          `Interaction event "${event.typeId}" is not supported by resolver "${resolver.id}".`,
        );
      }
    }
    return normalizeInteractionForHistory(event);
  }

  #commitWait(wait: LocalWaitState, agent: LessonAgentState): void {
    const state = this.#store.getSnapshot();
    this.#store.commit({
      ...state,
      waits: [...state.waits.filter(({ id }) => id !== wait.id), wait],
      agent,
      revision: state.revision + 1,
    });
  }

  #resolveWait(
    id: string,
    condition: Extract<LocalWaitCondition, { kind: "interaction" }>,
    result: InteractionWaitResult,
  ): void {
    const state = this.#store.getSnapshot();
    const current = state.waits.find((wait) => wait.id === id);
    if (!current) return;
    const event = result.event;
    const agent: LessonAgentState =
      result.status === "satisfied" && event
        ? {
            status: "working",
            assistantIntent: this.#assistantIntents.satisfied(
              event,
              condition.lessonStepId,
            ),
          }
        : result.status === "timed-out"
          ? { status: "waiting" }
          : { status: "idle" };
    this.#store.commit({
      ...state,
      waits: state.waits.map((wait) =>
        wait.id === id
          ? {
              ...wait,
              status:
                result.status === "satisfied"
                  ? "satisfied"
                  : result.status === "timed-out"
                    ? "timed-out"
                    : "cancelled",
              resolvedAt: this.#now(),
              ...(event ? { resolvedByEventId: event.id } : {}),
            }
          : wait,
      ),
      agent,
      revision: state.revision + 1,
    });
  }
}

function matchesInteraction(
  condition: Extract<LocalWaitCondition, { kind: "interaction" }>,
  event: NormalizedInteractionEvent,
): boolean {
  return (
    event.typeId === condition.eventTypeId &&
    (!condition.lessonStepId || event.lessonStepId === condition.lessonStepId) &&
    (!condition.target || targetRefsEqual(condition.target, event.targetRef))
  );
}

function targetRefsEqual(left: TargetRef, right: TargetRef | undefined): boolean {
  return (
    right !== undefined &&
    left.resolverId === right.resolverId &&
    JSON.stringify(sortObject(left.input)) === JSON.stringify(sortObject(right.input))
  );
}

function sortObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [
        key,
        item && typeof item === "object" && !Array.isArray(item)
          ? sortObject(item as Record<string, unknown>)
          : item,
      ]),
  );
}

import {
  DEFAULT_SYSTEM_LIMITS,
  type InteractionEvent,
} from "@/core/platform/contracts";

import type {
  LessonActivityEntry,
  LessonAgentState,
  LessonState,
  LessonStoreAdapter,
  NormalizedInteractionEvent,
} from "./contracts";

const MAX_AGENT_MESSAGE_CHARACTERS = 500;

export class LessonActivityService {
  readonly #store: LessonStoreAdapter;

  constructor(store: LessonStoreAdapter) {
    this.#store = store;
  }

  recordActivity(entry: LessonActivityEntry): LessonState {
    const state = this.#store.getSnapshot();
    const nextEntry = normalizeActivityEntry(entry);
    const activity = replaceAndAppendById(state.activity, nextEntry).slice(
      -DEFAULT_SYSTEM_LIMITS.maxActivityEvents,
    );
    return this.#commit({ ...state, activity });
  }

  recordInteraction(event: InteractionEvent): LessonState {
    const state = this.#store.getSnapshot();
    const nextEvent = normalizeInteractionForHistory(event);
    const interactions = replaceAndAppendById(state.interactions, nextEvent).slice(
      -DEFAULT_SYSTEM_LIMITS.maxActivityEvents,
    );
    return this.#commit({ ...state, interactions });
  }

  setAgentState(agent: LessonAgentState): LessonState {
    const state = this.#store.getSnapshot();
    return this.#commit({
      ...state,
      agent: {
        status: agent.status,
        ...(agent.message
          ? { message: compactText(agent.message, MAX_AGENT_MESSAGE_CHARACTERS) }
          : {}),
        ...(agent.assistantIntent
          ? { assistantIntent: structuredClone(agent.assistantIntent) }
          : {}),
      },
    });
  }

  #commit(state: LessonState): LessonState {
    const nextState = { ...state, revision: state.revision + 1 };
    this.#store.commit(nextState);
    return this.#store.getSnapshot();
  }
}

export function normalizeInteractionForHistory(
  event: InteractionEvent,
): NormalizedInteractionEvent {
  return {
    id: event.id,
    typeId: event.typeId,
    environmentRevision: event.environmentRevision,
    occurredAt: event.occurredAt,
    ...(event.targetRef
      ? {
          targetRef: {
            resolverId: event.targetRef.resolverId,
            input: structuredClone(event.targetRef.input),
          },
        }
      : {}),
    ...(event.surfaceId ? { surfaceId: event.surfaceId } : {}),
    ...(event.lessonStepId ? { lessonStepId: event.lessonStepId } : {}),
    ...(event.summary
      ? {
          summary: compactText(
            event.summary,
            DEFAULT_SYSTEM_LIMITS.maxTooltipCharacters,
          ),
        }
      : {}),
    ...(event.outcome ? { outcome: event.outcome } : {}),
  };
}

function normalizeActivityEntry(entry: LessonActivityEntry): LessonActivityEntry {
  return {
    id: entry.id,
    typeId: entry.typeId,
    source: entry.source,
    occurredAt: entry.occurredAt,
    ...(entry.lessonId ? { lessonId: entry.lessonId } : {}),
    ...(entry.lessonStepId ? { lessonStepId: entry.lessonStepId } : {}),
    ...(entry.outcome ? { outcome: entry.outcome } : {}),
    ...(entry.summary
      ? {
          summary: compactText(
            entry.summary,
            DEFAULT_SYSTEM_LIMITS.maxTooltipCharacters,
          ),
        }
      : {}),
  };
}

function compactText(value: string, maxCharacters: number): string {
  return value.replaceAll(/\s+/gu, " ").trim().slice(0, maxCharacters);
}

function replaceAndAppendById<T extends { id: string }>(
  entries: readonly T[],
  nextEntry: T,
): T[] {
  return [...entries.filter((entry) => entry.id !== nextEntry.id), nextEntry];
}

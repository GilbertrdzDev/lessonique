import { DEFAULT_SYSTEM_LIMITS } from "@/core/platform/contracts";

import type { ToolResultError, ToolResultStatus } from "./contracts";
import type { WebMCPToolName } from "./tool-names";
import type { ToolActivityPresentation } from "./tool-activity-presentation";

export type ToolInvocationPhase =
  | "received"
  | "validated"
  | "capability_checked"
  | "executing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ToolInvocationEvent = {
  operationId: string;
  toolName: WebMCPToolName;
  phase: ToolInvocationPhase;
  occurredAt: string;
  status?: ToolResultStatus;
  revision?: number;
  error?: ToolResultError;
  presentation?: ToolActivityPresentation;
};

export type ToolActivityEntry = {
  operationId: string;
  toolName: WebMCPToolName;
  phase: ToolInvocationPhase;
  receivedAt: string;
  updatedAt: string;
  status?: ToolResultStatus;
  revision?: number;
  error?: ToolResultError;
  presentation?: ToolActivityPresentation;
};

export type ToolActivityListener = (
  event: ToolInvocationEvent,
  entries: readonly ToolActivityEntry[],
) => void;

export class ToolActivityLogger {
  readonly #maxEntries: number;
  readonly #entries: ToolActivityEntry[] = [];
  readonly #listeners = new Set<ToolActivityListener>();

  constructor(maxEntries = DEFAULT_SYSTEM_LIMITS.maxActivityEvents) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError("Tool activity capacity must be a positive integer.");
    }
    this.#maxEntries = maxEntries;
  }

  getSnapshot(): readonly ToolActivityEntry[] {
    return this.#entries.map(cloneActivityEntry);
  }

  subscribe(listener: ToolActivityListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  record(event: ToolInvocationEvent): void {
    const existingIndex = this.#entries.findIndex(
      ({ operationId }) => operationId === event.operationId,
    );
    const existing = existingIndex >= 0 ? this.#entries[existingIndex] : undefined;
    const nextEntry: ToolActivityEntry = existing
      ? {
          ...existing,
          phase: event.phase,
          updatedAt: event.occurredAt,
          ...(event.status === undefined ? {} : { status: event.status }),
          ...(event.revision === undefined ? {} : { revision: event.revision }),
          ...(event.error === undefined ? {} : { error: cloneToolError(event.error) }),
          ...(event.presentation === undefined
            ? {}
            : { presentation: { ...event.presentation } }),
        }
      : {
          operationId: event.operationId,
          toolName: event.toolName,
          phase: event.phase,
          receivedAt: event.occurredAt,
          updatedAt: event.occurredAt,
          ...(event.status === undefined ? {} : { status: event.status }),
          ...(event.revision === undefined ? {} : { revision: event.revision }),
          ...(event.error === undefined ? {} : { error: cloneToolError(event.error) }),
          ...(event.presentation === undefined
            ? {}
            : { presentation: { ...event.presentation } }),
        };

    if (existingIndex >= 0) {
      this.#entries[existingIndex] = nextEntry;
    } else {
      this.#entries.push(nextEntry);
      if (this.#entries.length > this.#maxEntries) {
        this.#entries.splice(0, this.#entries.length - this.#maxEntries);
      }
    }

    const snapshot = this.getSnapshot();
    this.#listeners.forEach((listener) => listener(cloneInvocationEvent(event), snapshot));
  }
}

function cloneActivityEntry(entry: ToolActivityEntry): ToolActivityEntry {
  return {
    ...entry,
    ...(entry.error === undefined ? {} : { error: cloneToolError(entry.error) }),
    ...(entry.presentation === undefined
      ? {}
      : { presentation: { ...entry.presentation } }),
  };
}

function cloneInvocationEvent(event: ToolInvocationEvent): ToolInvocationEvent {
  return {
    ...event,
    ...(event.error === undefined ? {} : { error: cloneToolError(event.error) }),
    ...(event.presentation === undefined
      ? {}
      : { presentation: { ...event.presentation } }),
  };
}

function cloneToolError(error: ToolResultError): ToolResultError {
  return {
    ...error,
    ...(error.supportedAlternatives === undefined
      ? {}
      : { supportedAlternatives: [...error.supportedAlternatives] }),
  };
}

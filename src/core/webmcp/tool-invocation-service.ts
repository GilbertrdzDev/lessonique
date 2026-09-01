import { ZodError, type z } from "zod";

import { CapabilityValidationError } from "./capabilities";
import type {
  ToolCapabilityCheck,
  ToolExecutionResult,
  ToolHandler,
  ToolInvocationContext,
  ToolResult,
  ToolResultError,
  WebMCPToolInputMap,
} from "./contracts";
import {
  ToolActivityLogger,
  type ToolActivityListener,
  type ToolInvocationEvent,
  type ToolInvocationPhase,
} from "./tool-activity-logger";
import type { WebMCPToolName } from "./tool-names";
import {
  createToolActivityPresentation,
  type ToolActivityPresentation,
} from "./tool-activity-presentation";

const MAX_ERROR_MESSAGE_LENGTH = 240;
const MAX_ALTERNATIVES = 10;
let fallbackOperationSequence = 0;

export type InvocableToolDefinition<TName extends WebMCPToolName = WebMCPToolName> = {
  name: TName;
  inputSchema: z.ZodType<WebMCPToolInputMap[TName]>;
  capabilityCheck?: ToolCapabilityCheck<TName>;
  handler: ToolHandler<TName>;
};

export type ToolInvocationOptions = {
  signal?: AbortSignal;
};

export type ToolInvocationServiceOptions = {
  activityLogger?: ToolActivityLogger;
  createOperationId?: () => string;
  now?: () => string;
};

export class ToolInvocationError extends Error {
  readonly code: string;
  readonly recoverable: boolean;
  readonly supportedAlternatives?: string[];

  constructor(options: {
    code: string;
    message: string;
    recoverable: boolean;
    supportedAlternatives?: readonly string[];
  }) {
    super(options.message);
    this.name = "ToolInvocationError";
    this.code = options.code;
    this.recoverable = options.recoverable;
    this.supportedAlternatives = options.supportedAlternatives
      ? [...options.supportedAlternatives]
      : undefined;
  }
}

export class ToolInvocationService {
  readonly #activityLogger: ToolActivityLogger;
  readonly #createOperationId: () => string;
  readonly #now: () => string;

  constructor(options: ToolInvocationServiceOptions = {}) {
    this.#activityLogger = options.activityLogger ?? new ToolActivityLogger();
    this.#createOperationId = options.createOperationId ?? createDefaultOperationId;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  get activityLogger(): ToolActivityLogger {
    return this.#activityLogger;
  }

  subscribe(listener: ToolActivityListener): () => void {
    return this.#activityLogger.subscribe(listener);
  }

  async invoke<TName extends WebMCPToolName>(
    definition: InvocableToolDefinition<TName>,
    input: unknown,
    options: ToolInvocationOptions = {},
  ): Promise<ToolResult<unknown>> {
    const operationId = this.#createOperationId();
    const controller = new AbortController();
    const stopForwardingAbort = forwardAbort(options.signal, controller);
    const context: ToolInvocationContext = {
      operationId,
      signal: controller.signal,
    };
    let validatedInput: WebMCPToolInputMap[TName] | null = null;
    let presentation: ToolActivityPresentation | undefined;

    this.#record(definition.name, operationId, "received");
    try {
      throwIfAborted(controller.signal);
      validatedInput = definition.inputSchema.parse(input);
      presentation = createToolActivityPresentation(
        definition.name,
        validatedInput,
      );
      this.#record(
        definition.name,
        operationId,
        "validated",
        undefined,
        presentation,
      );

      throwIfAborted(controller.signal);
      await definition.capabilityCheck?.(validatedInput, context);
      this.#record(
        definition.name,
        operationId,
        "capability_checked",
        undefined,
        presentation,
      );

      throwIfAborted(controller.signal);
      this.#record(
        definition.name,
        operationId,
        "executing",
        undefined,
        presentation,
      );
      const execution = await definition.handler(validatedInput, context);
      const result = normalizeExecutionResult(operationId, execution);
      presentation = createToolActivityPresentation(
        definition.name,
        validatedInput,
        result,
      );
      this.#record(
        definition.name,
        operationId,
        result.status === "failed"
          ? "failed"
          : result.status === "cancelled"
            ? "cancelled"
            : "succeeded",
        result,
        presentation,
      );
      return result;
    } catch (error) {
      const compactError = toCompactToolError(error);
      const cancelled = compactError.code === "operation_cancelled";
      const result: ToolResult<unknown> = {
        ok: false,
        operationId,
        status: cancelled ? "cancelled" : "failed",
        error: compactError,
      };
      if (validatedInput) {
        presentation = createToolActivityPresentation(
          definition.name,
          validatedInput,
          result,
        );
      }
      this.#record(
        definition.name,
        operationId,
        cancelled ? "cancelled" : "failed",
        result,
        presentation,
      );
      return result;
    } finally {
      stopForwardingAbort();
    }
  }

  #record(
    toolName: WebMCPToolName,
    operationId: string,
    phase: ToolInvocationPhase,
    result?: ToolResult<unknown>,
    presentation?: ToolActivityPresentation,
  ): void {
    const event: ToolInvocationEvent = {
      operationId,
      toolName,
      phase,
      occurredAt: this.#now(),
      ...(result?.status === undefined ? {} : { status: result.status }),
      ...(result?.revision === undefined ? {} : { revision: result.revision }),
      ...(result?.error === undefined ? {} : { error: result.error }),
      ...(presentation === undefined ? {} : { presentation }),
    };
    this.#activityLogger.record(event);
  }
}

export function toCompactToolError(error: unknown): ToolResultError {
  if (error instanceof ZodError) {
    return {
      code: "invalid_input",
      message: "The tool input did not match the closed schema.",
      recoverable: true,
    };
  }
  if (error instanceof CapabilityValidationError) {
    return compactToolError({
      code: error.code,
      message: error.message,
      recoverable: true,
      supportedAlternatives: error.supportedAlternatives,
    });
  }
  if (error instanceof ToolInvocationError) {
    return compactToolError(error);
  }
  if (isAbortError(error)) {
    return {
      code: "operation_cancelled",
      message: "The tool invocation was cancelled.",
      recoverable: true,
    };
  }
  return {
    code: "internal_error",
    message: "The tool invocation failed unexpectedly.",
    recoverable: false,
  };
}

function normalizeExecutionResult(
  operationId: string,
  execution: ToolExecutionResult<unknown>,
): ToolResult<unknown> {
  if (execution.status === "failed" && execution.error === undefined) {
    return {
      ok: false,
      operationId,
      status: "failed",
      error: {
        code: "handler_failed",
        message: "The tool could not complete the requested operation.",
        recoverable: false,
      },
      ...(execution.revision === undefined ? {} : { revision: execution.revision }),
    };
  }
  return {
    ...execution,
    ok: execution.status === "failed" || execution.status === "cancelled" ? false : execution.ok,
    operationId,
    ...(execution.error === undefined ? {} : { error: compactToolError(execution.error) }),
  };
}

function compactToolError(error: ToolResultError): ToolResultError {
  const alternatives = error.supportedAlternatives
    ? [...new Set(error.supportedAlternatives)].slice(0, MAX_ALTERNATIVES)
    : undefined;
  return {
    code: error.code.slice(0, 80),
    message:
      error.message.length <= MAX_ERROR_MESSAGE_LENGTH
        ? error.message
        : `${error.message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`,
    recoverable: error.recoverable,
    ...(alternatives?.length ? { supportedAlternatives: alternatives } : {}),
  };
}

function createDefaultOperationId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId
    ? `webmcp-${randomId}`
    : `webmcp-${Date.now()}-${++fallbackOperationSequence}`;
}

function forwardAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined;
  if (source.aborted) {
    target.abort(source.reason);
    return () => undefined;
  }
  const abort = () => target.abort(source.reason);
  source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

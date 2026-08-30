import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import { validateClosedJsonObjectInput } from "@/core/platform/json-schema";
import { assertNamespacedId } from "@/core/platform/registry";

import type {
  ExecutableValidator,
  ValidationCondition,
  ValidationResult,
  ValidationWaitResult,
} from "./contracts";
import type { ValidationResultSnapshotStore } from "./diagnostics";

export interface ValidationChangeSource {
  subscribe(listener: () => void): () => void;
}

export interface ValidationEngineOptions {
  platform: ProviderPlatformRegistries;
  changes: ValidationChangeSource;
  now?: () => string;
  results?: ValidationResultSnapshotStore;
}

export interface ValidationWaitOptions {
  timeoutMs?: number;
}

export class ExecutableValidatorRegistry {
  readonly #validators = new Map<string, ExecutableValidator>();

  register(validator: ExecutableValidator): void {
    assertNamespacedId(validator.id, "Executable validator");
    if (this.#validators.has(validator.id)) {
      throw new Error(`Executable validator "${validator.id}" is already registered.`);
    }
    this.#validators.set(validator.id, validator);
  }

  require(id: string): ExecutableValidator {
    const validator = this.#validators.get(id);
    if (!validator) {
      throw new Error(`Executable validator "${id}" is not registered.`);
    }
    return validator;
  }

  list(): ExecutableValidator[] {
    return [...this.#validators.values()];
  }
}

export class ValidationEngine {
  readonly #platform: ProviderPlatformRegistries;
  readonly #changes: ValidationChangeSource;
  readonly #validators: ExecutableValidatorRegistry;
  readonly #now: () => string;
  readonly #results?: ValidationResultSnapshotStore;

  constructor(
    validators: ExecutableValidatorRegistry,
    options: ValidationEngineOptions,
  ) {
    this.#validators = validators;
    this.#platform = options.platform;
    this.#changes = options.changes;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#results = options.results;
  }

  async evaluate(
    condition: ValidationCondition,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<ValidationResult> {
    throwIfAborted(signal);
    const definition = this.#platform.validators.require(condition.validatorId);
    validateClosedJsonObjectInput(
      definition.inputSchema,
      condition.input,
      `Validator "${condition.validatorId}" input`,
    );
    const validator = this.#validators.require(condition.validatorId);
    let result: ValidationResult;
    try {
      result = await validator.evaluate(condition, signal);
    } catch (error) {
      if (signal.aborted || isAbortError(error)) throw createAbortError();
      result = {
        conditionId: condition.id,
        validatorId: condition.validatorId,
        status: "unavailable",
        evidence: [
          {
            kind: "workspace",
            summary:
              error instanceof Error
                ? error.message
                : "The validator was unavailable.",
          },
        ],
        diagnostics: [],
        evaluatedAt: this.#now(),
      };
    }
    this.#results?.record(result);
    return result;
  }

  async waitFor(
    condition: ValidationCondition,
    options: ValidationWaitOptions = {},
    signal: AbortSignal = new AbortController().signal,
  ): Promise<ValidationWaitResult> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300_000) {
      throw new RangeError(
        "Validation wait timeout must be between 1 and 300000 milliseconds.",
      );
    }
    let lastResult = await this.evaluate(condition, signal);
    if (lastResult.status === "passed") {
      return { status: "satisfied", result: lastResult };
    }

    return new Promise<ValidationWaitResult>((resolve) => {
      let settled = false;
      let evaluating = false;
      let queued = false;
      const finish = (status: ValidationWaitResult["status"]) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        signal.removeEventListener("abort", cancel);
        resolve({ status, result: lastResult });
      };
      const evaluateLatest = async () => {
        if (settled) return;
        if (evaluating) {
          queued = true;
          return;
        }
        evaluating = true;
        try {
          lastResult = await this.evaluate(condition, signal);
          if (lastResult.status === "passed") finish("satisfied");
        } catch (error) {
          if (isAbortError(error)) finish("cancelled");
        } finally {
          evaluating = false;
          if (queued && !settled) {
            queued = false;
            void evaluateLatest();
          }
        }
      };
      const unsubscribe = this.#changes.subscribe(() => void evaluateLatest());
      const timer = setTimeout(() => finish("timed-out"), timeoutMs);
      const cancel = () => finish("cancelled");
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
    });
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw createAbortError();
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function createAbortError(): DOMException {
  return new DOMException("Validation was cancelled.", "AbortError");
}

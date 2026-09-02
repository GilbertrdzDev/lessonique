import type {
  ParsedSourceDocument,
  SourceDocument,
  SourceParser,
} from "./contracts";

export interface ParseScheduleResult<TTree = unknown> {
  current: ParsedSourceDocument<TTree>;
  lastValid?: ParsedSourceDocument<TTree>;
}

export interface ParsingSchedulerOptions {
  debounceMs?: number;
}

type ScheduledParse = {
  controller: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  reject(error: unknown): void;
  removeExternalAbort(): void;
};

export class ParsingScheduler {
  readonly #debounceMs: number;
  readonly #scheduled = new Map<string, ScheduledParse>();
  readonly #lastValid = new Map<string, ParsedSourceDocument<unknown>>();

  constructor(options: ParsingSchedulerOptions = {}) {
    const debounceMs = options.debounceMs ?? 150;
    if (!Number.isFinite(debounceMs) || debounceMs < 0) {
      throw new RangeError("Parsing debounce must be a non-negative finite number.");
    }
    this.#debounceMs = debounceMs;
  }

  schedule<TTree>(
    document: SourceDocument,
    parser: SourceParser<TTree>,
    externalSignal?: AbortSignal,
  ): Promise<ParseScheduleResult<TTree>> {
    if (parser.languageId !== document.languageId) {
      return Promise.reject(
        new Error(
          `Parser "${parser.languageId}" cannot parse document language "${document.languageId}".`,
        ),
      );
    }
    this.cancel(document.path, "Parsing request was replaced.");
    if (externalSignal?.aborted) {
      return Promise.reject(createAbortError("Parsing request was cancelled."));
    }

    const controller = new AbortController();
    return new Promise<ParseScheduleResult<TTree>>((resolve, reject) => {
      const abortFromExternal = () =>
        this.cancel(document.path, "Parsing request was cancelled.");
      externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
      const request: ScheduledParse = {
        controller,
        reject,
        removeExternalAbort: () =>
          externalSignal?.removeEventListener("abort", abortFromExternal),
      };
      request.timer = setTimeout(() => {
        request.timer = undefined;
        void this.#execute(document, parser, request, resolve, reject);
      }, this.#debounceMs);
      this.#scheduled.set(document.path, request);
    });
  }

  cancel(path: string, message = "Parsing request was cancelled."): void {
    const request = this.#scheduled.get(path);
    if (!request) return;
    if (request.timer !== undefined) clearTimeout(request.timer);
    request.controller.abort(message);
    request.removeExternalAbort();
    this.#scheduled.delete(path);
    request.reject(createAbortError(message));
  }

  cancelAll(): void {
    [...this.#scheduled.keys()].forEach((path) => this.cancel(path));
  }

  getLastValid<TTree>(path: string): ParsedSourceDocument<TTree> | undefined {
    const result = this.#lastValid.get(path);
    return result ? (structuredClone(result) as ParsedSourceDocument<TTree>) : undefined;
  }

  async #execute<TTree>(
    document: SourceDocument,
    parser: SourceParser<TTree>,
    request: ScheduledParse,
    resolve: (result: ParseScheduleResult<TTree>) => void,
    reject: (error: unknown) => void,
  ): Promise<void> {
    try {
      const current = await parser.parse(document, request.controller.signal);
      if (request.controller.signal.aborted) {
        throw createAbortError("Parsing request was cancelled.");
      }
      const previous = this.#lastValid.get(document.path);
      if (current.valid) {
        this.#lastValid.set(document.path, structuredClone(current));
      }
      resolve({
        current,
        ...(!current.valid && previous
          ? { lastValid: structuredClone(previous) as ParsedSourceDocument<TTree> }
          : {}),
      });
    } catch (error) {
      reject(
        request.controller.signal.aborted
          ? createAbortError("Parsing request was cancelled.")
          : error,
      );
    } finally {
      request.removeExternalAbort();
      if (this.#scheduled.get(document.path) === request) {
        this.#scheduled.delete(document.path);
      }
    }
  }
}

function createAbortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

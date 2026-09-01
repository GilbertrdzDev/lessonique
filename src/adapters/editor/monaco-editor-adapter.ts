import type { editor, IDisposable, IPosition, IRange } from "monaco-editor";

import type { TargetRef } from "@/core/platform/contracts";
import type {
  EnvironmentActionId,
  InteractionEventTypeId,
  SurfaceId,
  TargetResolverId,
} from "@/core/platform/identifiers";
import type {
  EnvironmentActionResult,
  SurfaceSnapshot,
  SurfaceState,
} from "@/core/workspace/contracts";
import type { SurfaceAdapter } from "@/core/workspace/surface-adapter";
import {
  ObservableTargetHandle,
  type GuidanceTargetAdapter,
  type InteractionEventListener,
  type InteractionSourceAdapter,
  type ResolvedTargetHandle,
  type ResolvedTargetSnapshot,
  type TargetGeometry,
} from "@/core/workspace/targeting";

export interface MonacoEditorLike {
  focus(): void;
  updateOptions(options: editor.IEditorOptions): void;
  getDomNode(): HTMLElement | null;
  getScrolledVisiblePosition(
    position: IPosition,
  ): { top: number; left: number; height: number } | null;
  revealRangeInCenter(range: IRange): void;
  deltaDecorations(
    oldDecorations: string[],
    newDecorations: editor.IModelDeltaDecoration[],
  ): string[];
  onDidScrollChange(listener: () => void): IDisposable;
  onDidLayoutChange(listener: () => void): IDisposable;
  onDidChangeModel(listener: () => void): IDisposable;
  onDidChangeModelContent?(listener: () => void): IDisposable;
}

export interface CodeTargetInput {
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface MonacoEditorAdapterOptions {
  surfaceId: SurfaceId;
  codeTargetResolverId: TargetResolverId;
  focusActionId: EnvironmentActionId;
  openFile(path: string): Promise<void>;
  getActiveFilePath(): string | undefined;
  editorChangeEventTypeId?: InteractionEventTypeId;
  getEnvironmentRevision?(): number;
  now?(): string;
}

export class MonacoEditorAdapter
  implements SurfaceAdapter, GuidanceTargetAdapter, InteractionSourceAdapter
{
  readonly surfaceId: SurfaceId;
  readonly #codeTargetResolverId: TargetResolverId;
  readonly #focusActionId: EnvironmentActionId;
  readonly #openFile: (path: string) => Promise<void>;
  readonly #getActiveFilePath: () => string | undefined;
  readonly #editorChangeEventTypeId?: InteractionEventTypeId;
  readonly #getEnvironmentRevision: () => number;
  readonly #now: () => string;
  readonly #interactionListeners = new Set<InteractionEventListener>();
  readonly #editorLifecycleListeners = new Set<() => void>();
  #editor?: MonacoEditorLike;
  #contentSubscription?: IDisposable;
  #eventSequence = 0;
  #configuration?: SurfaceState;
  #focusRequested = false;

  constructor(options: MonacoEditorAdapterOptions) {
    this.surfaceId = options.surfaceId;
    this.#codeTargetResolverId = options.codeTargetResolverId;
    this.#focusActionId = options.focusActionId;
    this.#openFile = options.openFile;
    this.#getActiveFilePath = options.getActiveFilePath;
    this.#editorChangeEventTypeId = options.editorChangeEventTypeId;
    this.#getEnvironmentRevision = options.getEnvironmentRevision ?? (() => 0);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  attach(editorInstance: MonacoEditorLike): () => void {
    this.#editor = editorInstance;
    this.#contentSubscription?.dispose();
    this.#contentSubscription = editorInstance.onDidChangeModelContent?.(() =>
      this.#emitEditorChange(),
    );
    this.#applyEditorOptions();
    if (this.#focusRequested) {
      this.#focusRequested = false;
      editorInstance.focus();
    }
    this.#editorLifecycleListeners.forEach((listener) => listener());
    return () => {
      if (this.#editor === editorInstance) {
        this.#contentSubscription?.dispose();
        this.#contentSubscription = undefined;
        this.#editor = undefined;
        this.#editorLifecycleListeners.forEach((listener) => listener());
      }
    };
  }

  subscribeToInteractions(
    listener: InteractionEventListener,
    signal: AbortSignal,
  ): void {
    this.#interactionListeners.add(listener);
    signal.addEventListener(
      "abort",
      () => this.#interactionListeners.delete(listener),
      { once: true },
    );
  }

  async configure(configuration: SurfaceState): Promise<void> {
    this.#configuration = {
      ...configuration,
      options: { ...configuration.options },
    };
    this.#applyEditorOptions();
  }

  activate(): void {
    if (this.#editor) {
      this.#editor.focus();
      this.#focusRequested = false;
      return;
    }
    this.#focusRequested = true;
  }

  async executeAction(
    actionId: EnvironmentActionId,
  ): Promise<EnvironmentActionResult> {
    if (actionId !== this.#focusActionId) {
      return {
        actionId,
        accepted: false,
        message: `Editor action "${actionId}" is not supported.`,
      };
    }
    this.activate();
    return {
      actionId,
      accepted: true,
      message: this.#editor
        ? "The editor is focused."
        : "The editor will be focused when it mounts.",
    };
  }

  getSnapshot(): SurfaceSnapshot {
    return {
      surfaceId: this.surfaceId,
      ...(this.#configuration
        ? {
            configuration: {
              ...this.#configuration,
              options: { ...this.#configuration.options },
            },
          }
        : {}),
    };
  }

  supportsTargetResolver(resolverId: TargetResolverId): boolean {
    return resolverId === this.#codeTargetResolverId;
  }

  async prepareTarget(target: TargetRef, signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const input = readCodeTarget(target, this.#codeTargetResolverId);
    if (this.#getActiveFilePath() !== input.filePath) {
      await this.#openFile(input.filePath);
    }
    throwIfAborted(signal);
    this.#editor?.revealRangeInCenter(toRange(input));
  }

  async resolveTarget(
    target: TargetRef,
    signal: AbortSignal,
  ): Promise<ResolvedTargetHandle> {
    await this.prepareTarget(target, signal);
    const input = readCodeTarget(target, this.#codeTargetResolverId);
    const handle = new ObservableTargetHandle(this.#measureTarget(input));
    const update = () => handle.update(this.#measureTarget(input));
    let disposables: IDisposable[] = [];
    const subscribeToEditor = () => {
      disposables.forEach((disposable) => disposable.dispose());
      this.#editor?.revealRangeInCenter(toRange(input));
      disposables = this.#editor
        ? [
            this.#editor.onDidScrollChange(update),
            this.#editor.onDidLayoutChange(update),
            this.#editor.onDidChangeModel(update),
          ]
        : [];
      update();
    };
    this.#editorLifecycleListeners.add(subscribeToEditor);
    subscribeToEditor();
    const abort = () => {
      disposables.forEach((disposable) => disposable.dispose());
      this.#editorLifecycleListeners.delete(subscribeToEditor);
      handle.dispose();
    };
    signal.addEventListener("abort", abort, { once: true });

    return {
      getSnapshot: () => handle.getSnapshot(),
      subscribe: (listener) => handle.subscribe(listener),
      dispose: () => {
        signal.removeEventListener("abort", abort);
        abort();
      },
    };
  }

  decorateRange(target: TargetRef, className: string): () => void {
    const input = readCodeTarget(target, this.#codeTargetResolverId);
    if (!this.#editor) {
      return () => undefined;
    }
    const decorationIds = this.#editor.deltaDecorations([], [
      {
        range: toRange(input),
        options: { className },
      },
    ]);
    return () => this.#editor?.deltaDecorations(decorationIds, []);
  }

  #applyEditorOptions(): void {
    if (!this.#editor || !this.#configuration) {
      return;
    }
    const options = this.#configuration.options;
    this.#editor.updateOptions({
      wordWrap: options["editor.word-wrap"] === false ? "off" : "on",
      minimap: { enabled: options["editor.minimap"] === true },
      ...(typeof options["editor.font-size"] === "number"
        ? { fontSize: options["editor.font-size"] }
        : {}),
      readOnly: this.#configuration.modeId === "read_only",
    });
  }

  #measureTarget(input: CodeTargetInput): ResolvedTargetSnapshot {
    const editorInstance = this.#editor;
    if (!editorInstance || this.#getActiveFilePath() !== input.filePath) {
      return { status: "lost" };
    }
    const domNode = editorInstance.getDomNode();
    const start = editorInstance.getScrolledVisiblePosition({
      lineNumber: input.startLine,
      column: input.startColumn,
    });
    const end = editorInstance.getScrolledVisiblePosition({
      lineNumber: input.endLine,
      column: input.endColumn,
    });
    if (!domNode || !start || !end) {
      return { status: "lost" };
    }
    const editorRect = domNode.getBoundingClientRect();
    const geometry: TargetGeometry = {
      left: editorRect.left + Math.min(start.left, end.left),
      top: editorRect.top + start.top,
      width:
        input.startLine === input.endLine
          ? Math.max(2, Math.abs(end.left - start.left))
          : Math.max(2, editorRect.width - start.left),
      height: Math.max(start.height, end.top + end.height - start.top),
    };
    return { status: "resolved", geometry };
  }

  #emitEditorChange(): void {
    if (!this.#editorChangeEventTypeId) return;
    const activeFilePath = this.#getActiveFilePath();
    const event: import("@/core/platform/contracts").InteractionEvent = {
      id: `editor-interaction-${++this.#eventSequence}`,
      typeId: this.#editorChangeEventTypeId,
      surfaceId: this.surfaceId,
      environmentRevision: this.#getEnvironmentRevision(),
      occurredAt: this.#now(),
      ...(activeFilePath
        ? { summary: `Workspace file "${activeFilePath}" changed.` }
        : {}),
    };
    this.#interactionListeners.forEach((listener) => listener(event));
  }
}

function readCodeTarget(
  target: TargetRef,
  expectedResolverId: TargetResolverId,
): CodeTargetInput {
  if (target.resolverId !== expectedResolverId) {
    throw new Error(
      `Target resolver "${target.resolverId}" is not supported by the Monaco editor adapter.`,
    );
  }
  const input = target.input;
  const filePath = input.filePath;
  const startLine = input.startLine;
  const startColumn = input.startColumn;
  const endLine = input.endLine;
  const endColumn = input.endColumn;
  if (
    typeof filePath !== "string" ||
    !isPositiveInteger(startLine) ||
    !isPositiveInteger(startColumn) ||
    !isPositiveInteger(endLine) ||
    !isPositiveInteger(endColumn)
  ) {
    throw new Error("The semantic code target is invalid.");
  }
  return { filePath, startLine, startColumn, endLine, endColumn };
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function toRange(input: CodeTargetInput): IRange {
  return {
    startLineNumber: input.startLine,
    startColumn: input.startColumn,
    endLineNumber: input.endLine,
    endColumn: input.endColumn,
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("The target request was aborted.", "AbortError");
  }
}

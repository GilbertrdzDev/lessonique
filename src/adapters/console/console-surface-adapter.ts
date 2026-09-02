import type { TargetRef } from "@/core/platform/contracts";
import type {
  EnvironmentActionId,
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
  type ResolvedTargetHandle,
} from "@/core/workspace/targeting";

export class ConsoleSurfaceAdapter
  implements SurfaceAdapter, GuidanceTargetAdapter
{
  readonly surfaceId: SurfaceId;
  readonly #targetResolverId: TargetResolverId;
  readonly #entryElements = new Map<string, HTMLElement>();
  #configuration?: SurfaceState;

  constructor(surfaceId: SurfaceId, targetResolverId: TargetResolverId) {
    this.surfaceId = surfaceId;
    this.#targetResolverId = targetResolverId;
  }

  registerEntryElement(entryId: string, element: HTMLElement): () => void {
    this.#entryElements.set(entryId, element);
    return () => {
      if (this.#entryElements.get(entryId) === element) {
        this.#entryElements.delete(entryId);
      }
    };
  }

  async configure(configuration: SurfaceState): Promise<void> {
    this.#configuration = {
      ...configuration,
      options: { ...configuration.options },
    };
  }

  async executeAction(
    actionId: EnvironmentActionId,
  ): Promise<EnvironmentActionResult> {
    return {
      actionId,
      accepted: false,
      message: `Console surface action "${actionId}" is not supported.`,
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
    return resolverId === this.#targetResolverId;
  }

  async prepareTarget(target: TargetRef, signal: AbortSignal): Promise<void> {
    const entryId = readEntryId(target, this.#targetResolverId);
    if (signal.aborted) {
      throw new DOMException("The target request was aborted.", "AbortError");
    }
    this.#entryElements.get(entryId)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  async resolveTarget(
    target: TargetRef,
    signal: AbortSignal,
  ): Promise<ResolvedTargetHandle> {
    await this.prepareTarget(target, signal);
    const entryId = readEntryId(target, this.#targetResolverId);
    const measure = () => {
      const element = this.#entryElements.get(entryId);
      if (!element?.isConnected) {
        return { status: "lost" as const };
      }
      const rect = element.getBoundingClientRect();
      return {
        status: "resolved" as const,
        geometry: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      };
    };
    const handle = new ObservableTargetHandle(measure());
    const update = () => handle.update(measure());
    globalThis.addEventListener?.("resize", update);
    globalThis.addEventListener?.("scroll", update, true);
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    const element = this.#entryElements.get(entryId);
    if (element) {
      observer?.observe(element);
    }
    const abort = () => {
      globalThis.removeEventListener?.("resize", update);
      globalThis.removeEventListener?.("scroll", update, true);
      observer?.disconnect();
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
}

function readEntryId(target: TargetRef, resolverId: TargetResolverId): string {
  if (target.resolverId !== resolverId || typeof target.input.entryId !== "string") {
    throw new Error("The semantic console target is invalid.");
  }
  return target.input.entryId;
}

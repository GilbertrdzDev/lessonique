import type { InteractionEvent, TargetRef } from "@/core/platform/contracts";
import type {
  InteractionAnchorId,
  InteractionEventTypeId,
  TargetResolverId,
} from "@/core/platform/identifiers";
import type { InteractionAnchorRegistry } from "@/core/platform/registries";
import {
  ObservableTargetHandle,
  type GuidanceTargetAdapter,
  type InteractionEventListener,
  type InteractionSourceAdapter,
  type ResolvedTargetHandle,
} from "@/core/workspace/targeting";

export interface InteractionAnchorAdapterOptions {
  resolverId: TargetResolverId;
  activationEventTypeId: InteractionEventTypeId;
  definitions: InteractionAnchorRegistry;
  getEnvironmentRevision(): number;
  now?: () => string;
}

export class InteractionAnchorAdapter
  implements GuidanceTargetAdapter, InteractionSourceAdapter
{
  readonly #resolverId: TargetResolverId;
  readonly #activationEventTypeId: InteractionEventTypeId;
  readonly #definitions: InteractionAnchorRegistry;
  readonly #getEnvironmentRevision: () => number;
  readonly #now: () => string;
  readonly #elements = new Map<InteractionAnchorId, HTMLElement>();
  readonly #listeners = new Set<InteractionEventListener>();
  #eventSequence = 0;

  constructor(options: InteractionAnchorAdapterOptions) {
    this.#resolverId = options.resolverId;
    this.#activationEventTypeId = options.activationEventTypeId;
    this.#definitions = options.definitions;
    this.#getEnvironmentRevision = options.getEnvironmentRevision;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  registerElement(anchorId: InteractionAnchorId, element: HTMLElement): () => void {
    const definition = this.#definitions.require(anchorId);
    const emit = () => this.#emitActivation(anchorId, definition.surfaceId);
    this.#elements.set(anchorId, element);
    element.addEventListener("click", emit);
    element.addEventListener("focusin", emit);
    return () => {
      element.removeEventListener("click", emit);
      element.removeEventListener("focusin", emit);
      if (this.#elements.get(anchorId) === element) {
        this.#elements.delete(anchorId);
      }
    };
  }

  supportsTargetResolver(resolverId: TargetResolverId): boolean {
    return resolverId === this.#resolverId;
  }

  async prepareTarget(target: TargetRef, signal: AbortSignal): Promise<void> {
    const anchorId = this.#readAnchorId(target);
    if (signal.aborted) {
      throw new DOMException("The target request was aborted.", "AbortError");
    }
    this.#elements.get(anchorId)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }

  async resolveTarget(
    target: TargetRef,
    signal: AbortSignal,
  ): Promise<ResolvedTargetHandle> {
    await this.prepareTarget(target, signal);
    const anchorId = this.#readAnchorId(target);
    const measure = () => {
      const element = this.#elements.get(anchorId);
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
    const update = () => {
      const element = this.#elements.get(anchorId);
      if (element?.isConnected && isOutsideViewport(element.getBoundingClientRect())) {
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      handle.update(measure());
    };
    globalThis.addEventListener?.("resize", update);
    globalThis.addEventListener?.("scroll", update, true);
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    const element = this.#elements.get(anchorId);
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

  subscribeToInteractions(
    listener: InteractionEventListener,
    signal: AbortSignal,
  ): void {
    this.#listeners.add(listener);
    signal.addEventListener("abort", () => this.#listeners.delete(listener), {
      once: true,
    });
  }

  #readAnchorId(target: TargetRef): InteractionAnchorId {
    if (
      target.resolverId !== this.#resolverId ||
      typeof target.input.anchorId !== "string"
    ) {
      throw new Error("The registered surface target is invalid.");
    }
    this.#definitions.require(target.input.anchorId);
    return target.input.anchorId;
  }

  #emitActivation(anchorId: InteractionAnchorId, surfaceId?: string): void {
    const event: InteractionEvent = {
      id: `surface-interaction-${++this.#eventSequence}`,
      typeId: this.#activationEventTypeId,
      targetRef: {
        resolverId: this.#resolverId,
        input: { anchorId },
      },
      ...(surfaceId ? { surfaceId } : {}),
      environmentRevision: this.#getEnvironmentRevision(),
      occurredAt: this.#now(),
      summary: `Registered interface anchor "${anchorId}" was activated.`,
    };
    this.#listeners.forEach((listener) => listener(event));
  }
}

function isOutsideViewport(rect: DOMRect): boolean {
  const width = globalThis.innerWidth;
  const height = globalThis.innerHeight;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  return rect.right < 0 || rect.bottom < 0 || rect.left > width || rect.top > height;
}

import type { InteractionEvent, TargetRef } from "@/core/platform/contracts";
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
import type {
  GuidanceTargetAdapter,
  InteractionEventListener,
  InteractionSourceAdapter,
  ResolvedTargetHandle,
} from "@/core/workspace/targeting";

import { PreviewBridge, type PreviewInteraction } from "./preview-bridge";

export interface PreviewSurfaceAdapterOptions {
  surfaceId: SurfaceId;
  previewTargetResolverId: TargetResolverId;
  reloadActionId: EnvironmentActionId;
  interactionEventTypeIds: Readonly<{
    click: InteractionEventTypeId;
    change: InteractionEventTypeId;
    submit: InteractionEventTypeId;
  }>;
  getEnvironmentRevision(): number;
  now?: () => string;
}

export class PreviewSurfaceAdapter
  implements SurfaceAdapter, GuidanceTargetAdapter, InteractionSourceAdapter
{
  readonly surfaceId: SurfaceId;
  readonly #targetResolverId: TargetResolverId;
  readonly #reloadActionId: EnvironmentActionId;
  readonly #eventTypeIds: PreviewSurfaceAdapterOptions["interactionEventTypeIds"];
  readonly #getEnvironmentRevision: () => number;
  readonly #now: () => string;
  readonly #interactionListeners = new Set<InteractionEventListener>();
  #configuration?: SurfaceState;
  #bridge?: PreviewBridge;
  #bridgeSubscription?: AbortController;
  #reload?: () => Promise<void>;
  #eventSequence = 0;

  constructor(options: PreviewSurfaceAdapterOptions) {
    this.surfaceId = options.surfaceId;
    this.#targetResolverId = options.previewTargetResolverId;
    this.#reloadActionId = options.reloadActionId;
    this.#eventTypeIds = options.interactionEventTypeIds;
    this.#getEnvironmentRevision = options.getEnvironmentRevision;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  attachBridge(bridge: PreviewBridge): () => void {
    this.#bridgeSubscription?.abort();
    this.#bridge = bridge;
    const subscription = new AbortController();
    this.#bridgeSubscription = subscription;
    bridge.subscribeToInteractions(
      (interaction) => this.#emitInteraction(interaction),
      subscription.signal,
    );
    return () => {
      if (this.#bridge === bridge) {
        subscription.abort();
        this.#bridge = undefined;
        this.#bridgeSubscription = undefined;
      }
    };
  }

  attachRuntimeHost(host: { reload(): Promise<void> }): () => void {
    this.#reload = host.reload;
    return () => {
      if (this.#reload === host.reload) {
        this.#reload = undefined;
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
    if (actionId !== this.#reloadActionId) {
      return {
        actionId,
        accepted: false,
        message: `Preview action "${actionId}" is not supported.`,
      };
    }
    if (!this.#reload) {
      return {
        actionId,
        accepted: false,
        message: "The preview runtime is not mounted.",
      };
    }
    await this.#reload();
    return {
      actionId,
      accepted: true,
      message: "The preview was reloaded.",
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
    const anchorId = readAnchorId(target, this.#targetResolverId);
    if (signal.aborted) {
      throw new DOMException("The target request was aborted.", "AbortError");
    }
    this.#requireBridge().scrollToAnchor(anchorId);
  }

  async resolveTarget(
    target: TargetRef,
    signal: AbortSignal,
  ): Promise<ResolvedTargetHandle> {
    const anchorId = readAnchorId(target, this.#targetResolverId);
    const bridge = this.#requireBridge();
    const handle = bridge.resolveAnchor(anchorId, signal);
    bridge.scrollToAnchor(anchorId);
    return handle;
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

  #emitInteraction(interaction: PreviewInteraction): void {
    const typeId = this.#eventTypeIds[interaction.eventType];
    const event: InteractionEvent = {
      id: `preview-interaction-${++this.#eventSequence}`,
      typeId,
      targetRef: {
        resolverId: this.#targetResolverId,
        input: { anchorId: interaction.anchorId },
      },
      surfaceId: this.surfaceId,
      environmentRevision: this.#getEnvironmentRevision(),
      occurredAt: this.#now(),
      summary: `Preview ${interaction.eventType} on semantic anchor "${interaction.anchorId}".`,
    };
    this.#interactionListeners.forEach((listener) => listener(event));
  }

  #requireBridge(): PreviewBridge {
    if (!this.#bridge) {
      throw new Error("The typed Preview Bridge is not attached.");
    }
    return this.#bridge;
  }
}

function readAnchorId(
  target: TargetRef,
  resolverId: TargetResolverId,
): string {
  if (target.resolverId !== resolverId || typeof target.input.anchorId !== "string") {
    throw new Error("The semantic preview target is invalid.");
  }
  return target.input.anchorId;
}

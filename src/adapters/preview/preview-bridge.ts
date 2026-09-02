import {
  ObservableTargetHandle,
  type ResolvedTargetHandle,
  type TargetGeometry,
} from "@/core/workspace/targeting";
import {
  assertSafePreviewTargetQuery,
  type PreviewTargetQuery,
} from "@/core/code-intelligence";

const PREVIEW_BRIDGE_CHANNEL = "lessonique.preview.v1";

type PreviewBridgeRequest =
  | {
      channel: typeof PREVIEW_BRIDGE_CHANNEL;
      direction: "host-to-preview";
      type: "resolve";
      requestId: string;
      anchorId: string;
      query: PreviewTargetQuery;
    }
  | {
      channel: typeof PREVIEW_BRIDGE_CHANNEL;
      direction: "host-to-preview";
      type: "scroll";
      anchorId: string;
      query: PreviewTargetQuery;
    }
  | {
      channel: typeof PREVIEW_BRIDGE_CHANNEL;
      direction: "host-to-preview";
      type: "release";
      requestId: string;
    };

type PreviewTargetMessage = {
  channel: typeof PREVIEW_BRIDGE_CHANNEL;
  direction: "preview-to-host";
  type: "target";
  requestId: string;
  anchorId: string;
  status: "resolved" | "lost";
  geometry?: TargetGeometry;
};

type PreviewInteractionMessage = {
  channel: typeof PREVIEW_BRIDGE_CHANNEL;
  direction: "preview-to-host";
  type: "interaction";
  anchorId: string;
  eventType: "click" | "change" | "submit";
};

type PreviewReadyMessage = {
  channel: typeof PREVIEW_BRIDGE_CHANNEL;
  direction: "preview-to-host";
  type: "ready";
};

export type PreviewInteraction = Readonly<{
  anchorId: string;
  eventType: "click" | "change" | "submit";
}>;

type TrackedTarget = {
  anchorId: string;
  query: PreviewTargetQuery;
  handle: ObservableTargetHandle;
  localGeometry?: TargetGeometry;
};

export class PreviewBridge {
  readonly #hostWindow: Window;
  readonly #targets = new Map<string, TrackedTarget>();
  readonly #interactionListeners = new Set<
    (interaction: PreviewInteraction) => void
  >();
  #frame?: HTMLIFrameElement;
  #requestSequence = 0;
  #frameObserver?: ResizeObserver;
  #hostGeometryFrame?: number;

  constructor(hostWindow: Window = window) {
    this.#hostWindow = hostWindow;
    this.#hostWindow.addEventListener("message", this.#handleMessage);
    this.#hostWindow.addEventListener("resize", this.#handleHostGeometryChange);
    this.#hostWindow.addEventListener("scroll", this.#handleHostGeometryChange, true);
    this.#hostWindow.visualViewport?.addEventListener(
      "resize",
      this.#handleHostGeometryChange,
    );
    this.#hostWindow.visualViewport?.addEventListener(
      "scroll",
      this.#handleHostGeometryChange,
    );
  }

  attach(frame: HTMLIFrameElement): () => void {
    this.#frameObserver?.disconnect();
    this.#frame = frame;
    if (typeof ResizeObserver !== "undefined") {
      this.#frameObserver = new ResizeObserver(this.#handleHostGeometryChange);
      this.#frameObserver.observe(frame);
    }
    this.#targets.forEach((target, requestId) => {
      this.#post({
        channel: PREVIEW_BRIDGE_CHANNEL,
        direction: "host-to-preview",
        type: "resolve",
        requestId,
        anchorId: target.anchorId,
        query: target.query,
      });
    });
    return () => {
      if (this.#frame === frame) {
        this.#frameObserver?.disconnect();
        this.#frameObserver = undefined;
        this.#frame = undefined;
        this.#targets.forEach(({ handle }) =>
          handle.update({ status: "lost" }),
        );
      }
    };
  }

  resolveAnchor(anchorId: string, signal: AbortSignal): ResolvedTargetHandle {
    return this.resolveQuery(
      anchorId,
      { kind: "registered-anchor", anchorId },
      signal,
    );
  }

  resolveQuery(
    anchorId: string,
    query: PreviewTargetQuery,
    signal: AbortSignal,
  ): ResolvedTargetHandle {
    validateSemanticAnchorId(anchorId);
    assertSafePreviewTargetQuery(query);
    const requestId = `preview-target-${++this.#requestSequence}`;
    const handle = new ObservableTargetHandle({ status: "lost" });
    this.#targets.set(requestId, {
      anchorId,
      query: structuredClone(query),
      handle,
    });
    const abort = () => {
      if (!this.#targets.delete(requestId)) return;
      this.#post({
        channel: PREVIEW_BRIDGE_CHANNEL,
        direction: "host-to-preview",
        type: "release",
        requestId,
      });
      handle.dispose();
    };
    signal.addEventListener("abort", abort, { once: true });
    this.#post({
      channel: PREVIEW_BRIDGE_CHANNEL,
      direction: "host-to-preview",
      type: "resolve",
      requestId,
      anchorId,
      query,
    });

    return {
      getSnapshot: () => handle.getSnapshot(),
      subscribe: (listener) => handle.subscribe(listener),
      dispose: () => {
        signal.removeEventListener("abort", abort);
        abort();
      },
    };
  }

  scrollToAnchor(anchorId: string): void {
    this.scrollToQuery(anchorId, { kind: "registered-anchor", anchorId });
  }

  scrollToQuery(anchorId: string, query: PreviewTargetQuery): void {
    validateSemanticAnchorId(anchorId);
    assertSafePreviewTargetQuery(query);
    this.#post({
      channel: PREVIEW_BRIDGE_CHANNEL,
      direction: "host-to-preview",
      type: "scroll",
      anchorId,
      query,
    });
  }

  subscribeToInteractions(
    listener: (interaction: PreviewInteraction) => void,
    signal: AbortSignal,
  ): void {
    this.#interactionListeners.add(listener);
    signal.addEventListener(
      "abort",
      () => this.#interactionListeners.delete(listener),
      { once: true },
    );
  }

  dispose(): void {
    this.#hostWindow.removeEventListener("message", this.#handleMessage);
    this.#hostWindow.removeEventListener("resize", this.#handleHostGeometryChange);
    this.#hostWindow.removeEventListener(
      "scroll",
      this.#handleHostGeometryChange,
      true,
    );
    this.#hostWindow.visualViewport?.removeEventListener(
      "resize",
      this.#handleHostGeometryChange,
    );
    this.#hostWindow.visualViewport?.removeEventListener(
      "scroll",
      this.#handleHostGeometryChange,
    );
    if (this.#hostGeometryFrame !== undefined) {
      this.#hostWindow.cancelAnimationFrame?.(this.#hostGeometryFrame);
      this.#hostGeometryFrame = undefined;
    }
    this.#frameObserver?.disconnect();
    this.#targets.forEach(({ handle }, requestId) => {
      this.#post({
        channel: PREVIEW_BRIDGE_CHANNEL,
        direction: "host-to-preview",
        type: "release",
        requestId,
      });
      handle.dispose();
    });
    this.#targets.clear();
    this.#interactionListeners.clear();
    this.#frame = undefined;
  }

  readonly #handleMessage = (event: MessageEvent<unknown>): void => {
    if (!this.#frame?.contentWindow || event.source !== this.#frame.contentWindow) {
      return;
    }
    const message = parsePreviewMessage(event.data);
    if (!message) {
      return;
    }
    if (message.type === "ready") {
      this.#targets.forEach((target, requestId) => {
        this.#post({
          channel: PREVIEW_BRIDGE_CHANNEL,
          direction: "host-to-preview",
          type: "resolve",
          requestId,
          anchorId: target.anchorId,
          query: target.query,
        });
      });
      return;
    }
    if (message.type === "interaction") {
      this.#interactionListeners.forEach((listener) =>
        listener({ anchorId: message.anchorId, eventType: message.eventType }),
      );
      return;
    }
    const target = this.#targets.get(message.requestId);
    if (!target || target.anchorId !== message.anchorId) {
      return;
    }
    if (message.status === "lost" || !message.geometry) {
      target.localGeometry = undefined;
      target.handle.update({ status: "lost" });
      return;
    }
    target.localGeometry = { ...message.geometry };
    target.handle.update({
      status: "resolved",
      geometry: this.#toHostGeometry(message.geometry),
    });
  };

  readonly #handleHostGeometryChange = (): void => {
    if (typeof this.#hostWindow.requestAnimationFrame !== "function") {
      this.#publishHostGeometry();
      return;
    }
    if (this.#hostGeometryFrame !== undefined) {
      this.#hostWindow.cancelAnimationFrame?.(this.#hostGeometryFrame);
    }
    this.#hostGeometryFrame = this.#hostWindow.requestAnimationFrame(() => {
      this.#hostGeometryFrame = this.#hostWindow.requestAnimationFrame(() => {
        this.#hostGeometryFrame = undefined;
        this.#publishHostGeometry();
      });
    });
  };

  #publishHostGeometry(): void {
    this.#targets.forEach((target) => {
      if (target.localGeometry) {
        target.handle.update({
          status: "resolved",
          geometry: this.#toHostGeometry(target.localGeometry),
        });
      }
    });
  }

  #toHostGeometry(geometry: TargetGeometry): TargetGeometry {
    const frameRect = this.#frame?.getBoundingClientRect();
    if (!frameRect) {
      return { ...geometry };
    }
    return {
      left: frameRect.left + geometry.left,
      top: frameRect.top + geometry.top,
      width: geometry.width,
      height: geometry.height,
    };
  }

  #post(message: PreviewBridgeRequest): void {
    this.#frame?.contentWindow?.postMessage(message, "*");
  }
}

function parsePreviewMessage(
  value: unknown,
): PreviewTargetMessage | PreviewInteractionMessage | PreviewReadyMessage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    value.channel !== PREVIEW_BRIDGE_CHANNEL ||
    value.direction !== "preview-to-host"
  ) {
    return undefined;
  }
  if (value.type === "ready") {
    return value as PreviewReadyMessage;
  }
  if (typeof value.anchorId !== "string") {
    return undefined;
  }
  try {
    validateSemanticAnchorId(value.anchorId);
  } catch {
    return undefined;
  }
  if (
    value.type === "interaction" &&
    (value.eventType === "click" ||
      value.eventType === "change" ||
      value.eventType === "submit")
  ) {
    return value as PreviewInteractionMessage;
  }
  if (
    value.type !== "target" ||
    typeof value.requestId !== "string" ||
    (value.status !== "resolved" && value.status !== "lost")
  ) {
    return undefined;
  }
  if (value.status === "lost") {
    return value as PreviewTargetMessage;
  }
  if (!isTargetGeometry(value.geometry)) {
    return undefined;
  }
  return value as PreviewTargetMessage;
}

function isTargetGeometry(value: unknown): value is TargetGeometry {
  return (
    isRecord(value) &&
    isFiniteNumber(value.left) &&
    isFiniteNumber(value.top) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
    value.width >= 0 &&
    value.height >= 0
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSemanticAnchorId(anchorId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(anchorId)) {
    throw new Error(`Preview anchor ID "${anchorId}" is invalid.`);
  }
}

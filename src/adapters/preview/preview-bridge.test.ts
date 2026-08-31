import { afterEach, describe, expect, it, vi } from "vitest";

import { PreviewBridge } from "./preview-bridge";
import {
  createSandpackPreviewFiles,
  createSandpackPreviewFilesFromRuntime,
  PREVIEW_BRIDGE_RUNTIME_PATH,
} from "./preview-bridge-script";

describe("PreviewBridge", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves typed preview anchors into host geometry", () => {
    const host = createHostWindow();
    const frameWindow = { postMessage: vi.fn() };
    const frame = {
      contentWindow: frameWindow,
      getBoundingClientRect: () => ({ left: 100, top: 200 }),
    } as unknown as HTMLIFrameElement;
    const bridge = new PreviewBridge(host.window);
    bridge.attach(frame);
    const handle = bridge.resolveAnchor(
      "hero.button",
      new AbortController().signal,
    );

    host.emitMessage(frameWindow, {
      channel: "lessonique.preview.v1",
      direction: "preview-to-host",
      type: "target",
      requestId: "preview-target-1",
      anchorId: "hero.button",
      status: "resolved",
      geometry: { left: 10, top: 20, width: 80, height: 30 },
    });

    expect(handle.getSnapshot()).toEqual({
      status: "resolved",
      geometry: { left: 110, top: 220, width: 80, height: 30 },
    });
  });

  it("keeps target geometry aligned through host scroll and loss recovery", () => {
    const host = createHostWindow();
    const frameWindow = { postMessage: vi.fn() };
    let framePosition = { left: 100, top: 200 };
    const frame = {
      contentWindow: frameWindow,
      getBoundingClientRect: () => framePosition,
    } as unknown as HTMLIFrameElement;
    const bridge = new PreviewBridge(host.window);
    bridge.attach(frame);
    const handle = bridge.resolveAnchor(
      "hero.button",
      new AbortController().signal,
    );
    const resolvedMessage = {
      channel: "lessonique.preview.v1",
      direction: "preview-to-host",
      type: "target",
      requestId: "preview-target-1",
      anchorId: "hero.button",
      status: "resolved",
      geometry: { left: 10, top: 20, width: 80, height: 30 },
    };
    host.emitMessage(frameWindow, resolvedMessage);

    framePosition = { left: 40, top: 60 };
    host.emit("scroll");

    expect(handle.getSnapshot()).toEqual({
      status: "resolved",
      geometry: { left: 50, top: 80, width: 80, height: 30 },
    });

    host.emitMessage(frameWindow, {
      ...resolvedMessage,
      status: "lost",
      geometry: undefined,
    });
    expect(handle.getSnapshot()).toEqual({ status: "lost" });

    host.emitMessage(frameWindow, resolvedMessage);
    bridge.scrollToAnchor("hero.button");

    expect(handle.getSnapshot().status).toBe("resolved");
    expect(frameWindow.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "scroll", anchorId: "hero.button" }),
      "*",
    );
  });

  it("ignores messages from other frames and exposes no arbitrary DOM payload", () => {
    const host = createHostWindow();
    const frameWindow = { postMessage: vi.fn() };
    const frame = {
      contentWindow: frameWindow,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLIFrameElement;
    const bridge = new PreviewBridge(host.window);
    bridge.attach(frame);
    const handle = bridge.resolveAnchor(
      "hero.button",
      new AbortController().signal,
    );

    host.emitMessage({ postMessage: vi.fn() }, {
      channel: "lessonique.preview.v1",
      direction: "preview-to-host",
      type: "target",
      requestId: "preview-target-1",
      anchorId: "hero.button",
      status: "resolved",
      geometry: { left: 1, top: 1, width: 1, height: 1 },
    });

    expect(handle.getSnapshot()).toEqual({ status: "lost" });
    expect(() => bridge.resolveAnchor("button[data-secret]", new AbortController().signal)).toThrow(
      /invalid/u,
    );
  });

  it("rejects unregistered interactions and malformed target payloads", () => {
    const host = createHostWindow();
    const frameWindow = { postMessage: vi.fn() };
    const frame = {
      contentWindow: frameWindow,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLIFrameElement;
    const bridge = new PreviewBridge(host.window);
    bridge.attach(frame);
    const listener = vi.fn();
    bridge.subscribeToInteractions(listener, new AbortController().signal);
    const handle = bridge.resolveAnchor(
      "hero.button",
      new AbortController().signal,
    );

    host.emitMessage(frameWindow, {
      channel: "lessonique.preview.v1",
      direction: "preview-to-host",
      type: "interaction",
      eventType: "keydown",
      anchorId: "hero.button",
    });
    host.emitMessage(frameWindow, {
      channel: "lessonique.preview.v1",
      direction: "preview-to-host",
      type: "interaction",
      eventType: "click",
      anchorId: "button[data-secret]",
    });
    host.emitMessage(frameWindow, {
      channel: "lessonique.preview.v1",
      direction: "preview-to-host",
      type: "target",
      requestId: "preview-target-1",
      anchorId: "hero.button",
      status: "resolved",
      geometry: { left: 0, top: 0, width: Number.POSITIVE_INFINITY, height: 10 },
    });

    expect(listener).not.toHaveBeenCalled();
    expect(handle.getSnapshot()).toEqual({ status: "lost" });
  });

  it("sends source-derived HTML queries as closed typed bridge messages", () => {
    const host = createHostWindow();
    const frameWindow = { postMessage: vi.fn() };
    const frame = {
      contentWindow: frameWindow,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLIFrameElement;
    const bridge = new PreviewBridge(host.window);
    bridge.attach(frame);

    bridge.resolveQuery(
      "source.1234abcd",
      {
        kind: "html-element",
        tagName: "button",
        className: "action",
        occurrence: 1,
      },
      new AbortController().signal,
    );

    expect(frameWindow.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "resolve",
        anchorId: "source.1234abcd",
        query: {
          kind: "html-element",
          tagName: "button",
          className: "action",
          occurrence: 1,
        },
      }),
      "*",
    );
    const validPostCount = frameWindow.postMessage.mock.calls.length;
    [
      { selector: "button.action" },
      { xpath: "//button" },
      { domPath: "body/button[1]" },
      { coordinates: [10, 20] },
    ].forEach((unsafeInput) => {
      expect(() =>
        bridge.resolveQuery(
          "source.invalid",
          {
            kind: "html-element",
            tagName: "button",
            occurrence: 0,
            ...unsafeInput,
          } as never,
          new AbortController().signal,
        ),
      ).toThrow();
    });
    expect(frameWindow.postMessage).toHaveBeenCalledTimes(validPostCount);
  });

  it("replays active target requests when a newly loaded preview reports readiness", () => {
    const host = createHostWindow();
    const frameWindow = { postMessage: vi.fn() };
    const frame = {
      contentWindow: frameWindow,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLIFrameElement;
    const bridge = new PreviewBridge(host.window);
    bridge.attach(frame);
    bridge.resolveAnchor("hero.button", new AbortController().signal);
    frameWindow.postMessage.mockClear();

    host.emitMessage(frameWindow, {
      channel: "lessonique.preview.v1",
      direction: "preview-to-host",
      type: "ready",
    });

    expect(frameWindow.postMessage).toHaveBeenCalledOnce();
    expect(frameWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "resolve",
        requestId: "preview-target-1",
        anchorId: "hero.button",
      }),
      "*",
    );
  });

  it("releases preview tracking when handles and the bridge are disposed", () => {
    const host = createHostWindow();
    const frameWindow = { postMessage: vi.fn() };
    const bridge = new PreviewBridge(host.window);
    bridge.attach({
      contentWindow: frameWindow,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLIFrameElement);
    const first = bridge.resolveAnchor(
      "hero.first",
      new AbortController().signal,
    );
    bridge.resolveAnchor("hero.second", new AbortController().signal);

    first.dispose();
    expect(frameWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "release", requestId: "preview-target-1" }),
      "*",
    );

    bridge.dispose();
    expect(frameWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "release", requestId: "preview-target-2" }),
      "*",
    );
    expect(host.listenerCount()).toBe(0);
  });

  it("keeps one frame observer attached and disconnects replacements", () => {
    const observers: Array<{
      disconnect: ReturnType<typeof vi.fn>;
      observe: ReturnType<typeof vi.fn>;
    }> = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        disconnect = vi.fn();
        observe = vi.fn();

        constructor() {
          observers.push(this);
        }
      },
    );
    const host = createHostWindow();
    const bridge = new PreviewBridge(host.window);
    const firstFrame = {
      contentWindow: { postMessage: vi.fn() },
    } as unknown as HTMLIFrameElement;
    const secondFrame = {
      contentWindow: { postMessage: vi.fn() },
    } as unknown as HTMLIFrameElement;

    bridge.attach(firstFrame);
    const detachSecond = bridge.attach(secondFrame);

    expect(observers).toHaveLength(2);
    expect(observers[0]?.observe).toHaveBeenCalledOnce();
    expect(observers[0]?.disconnect).toHaveBeenCalledOnce();
    expect(observers[1]?.observe).toHaveBeenCalledOnce();
    detachSecond();
    expect(observers[1]?.disconnect).toHaveBeenCalledOnce();
  });
});

describe("createSandpackPreviewFiles", () => {
  it("injects a hidden typed bridge without changing workspace files", () => {
    const files = [
      {
        path: "index.html",
        languageId: "language.html",
        content: "<body><button data-lessonique-anchor=\"run\">Run</button></body>",
        visible: true,
      },
    ];

    const result = createSandpackPreviewFiles(files);

    expect(result["/index.html"]?.code).toContain(PREVIEW_BRIDGE_RUNTIME_PATH);
    expect(result[PREVIEW_BRIDGE_RUNTIME_PATH]?.hidden).toBe(true);
    expect(files[0]?.content).not.toContain(PREVIEW_BRIDGE_RUNTIME_PATH);
  });

  it("prepares runtime adapter files through the same preview bridge", () => {
    const result = createSandpackPreviewFilesFromRuntime({
      "/script.js": "console.log('test');",
    });

    expect(result["/script.js"]?.code).toBe("console.log('test');");
    expect(result["/index.html"]?.code).toContain("/script.js");
    expect(result[PREVIEW_BRIDGE_RUNTIME_PATH]?.hidden).toBe(true);
  });
});

function createHostWindow() {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const window = {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener);
      listeners.set(type, entries);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener);
    },
  } as unknown as Window;
  return {
    window,
    listenerCount() {
      return [...listeners.values()].reduce((total, entries) => total + entries.size, 0);
    },
    emit(type: string) {
      listeners.get(type)?.forEach((listener) => {
        if (typeof listener === "function") {
          listener(new Event(type));
        }
      });
    },
    emitMessage(source: unknown, data: unknown) {
      listeners.get("message")?.forEach((listener) => {
        if (typeof listener === "function") {
          listener({ source, data } as MessageEvent);
        }
      });
    },
  };
}

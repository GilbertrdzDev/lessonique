import { describe, expect, it, vi } from "vitest";

import { PreviewBridge } from "./preview-bridge";
import {
  createSandpackPreviewFiles,
  createSandpackPreviewFilesFromRuntime,
  PREVIEW_BRIDGE_RUNTIME_PATH,
} from "./preview-bridge-script";

describe("PreviewBridge", () => {
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

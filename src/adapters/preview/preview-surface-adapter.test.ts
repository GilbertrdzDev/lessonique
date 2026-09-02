import { describe, expect, it, vi } from "vitest";

import { PreviewBridge } from "./preview-bridge";
import { PreviewSurfaceAdapter } from "./preview-surface-adapter";

describe("PreviewSurfaceAdapter", () => {
  it("normalizes privacy-filtered preview interactions", () => {
    const host = createHostWindow();
    const frameWindow = { postMessage: vi.fn() };
    const bridge = new PreviewBridge(host.window);
    bridge.attach({
      contentWindow: frameWindow,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLIFrameElement);
    const adapter = createAdapter();
    adapter.attachBridge(bridge);
    const listener = vi.fn();
    adapter.subscribeToInteractions(listener, new AbortController().signal);

    host.emitMessage(frameWindow, {
      channel: "lessonique.preview.v1",
      direction: "preview-to-host",
      type: "interaction",
      eventType: "click",
      anchorId: "run.button",
      value: "must-not-be-forwarded",
    });

    expect(listener).toHaveBeenCalledWith({
      id: "preview-interaction-1",
      typeId: "interaction.preview-click",
      targetRef: {
        resolverId: "target.preview-anchor",
        input: { anchorId: "run.button" },
      },
      surfaceId: "preview",
      environmentRevision: 7,
      occurredAt: "2026-08-30T00:00:00.000Z",
      summary: 'Preview click on semantic anchor "run.button".',
    });
    expect(JSON.stringify(listener.mock.calls)).not.toContain(
      "must-not-be-forwarded",
    );
  });

  it("returns bounded fallbacks when the preview bridge and runtime are unavailable", async () => {
    const adapter = createAdapter();

    await expect(
      adapter.resolveTarget(
        {
          resolverId: "target.preview-anchor",
          input: { anchorId: "run.button" },
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow("The typed Preview Bridge is not attached.");
    await expect(
      adapter.executeAction("surface.preview.reload"),
    ).resolves.toEqual({
      actionId: "surface.preview.reload",
      accepted: false,
      message: "The preview runtime is not mounted.",
    });
  });

  it("stops forwarding interactions after the preview bridge detaches", () => {
    const host = createHostWindow();
    const frameWindow = { postMessage: vi.fn() };
    const bridge = new PreviewBridge(host.window);
    bridge.attach({
      contentWindow: frameWindow,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLIFrameElement);
    const adapter = createAdapter();
    const detach = adapter.attachBridge(bridge);
    const listener = vi.fn();
    adapter.subscribeToInteractions(listener, new AbortController().signal);

    detach();
    host.emitMessage(frameWindow, {
      channel: "lessonique.preview.v1",
      direction: "preview-to-host",
      type: "interaction",
      eventType: "click",
      anchorId: "run.button",
    });

    expect(listener).not.toHaveBeenCalled();
  });
});

function createAdapter(): PreviewSurfaceAdapter {
  return new PreviewSurfaceAdapter({
    surfaceId: "preview",
    previewTargetResolverId: "target.preview-anchor",
    reloadActionId: "surface.preview.reload",
    interactionEventTypeIds: {
      click: "interaction.preview-click",
      change: "interaction.preview-change",
      submit: "interaction.preview-submit",
    },
    getEnvironmentRevision: () => 7,
    now: () => "2026-08-30T00:00:00.000Z",
  });
}

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
    emitMessage(source: unknown, data: unknown) {
      listeners.get("message")?.forEach((listener) => {
        if (typeof listener === "function") {
          listener({ source, data } as MessageEvent);
        }
      });
    },
  };
}

import { describe, expect, it, vi } from "vitest";

import type { SurfaceState } from "@/core/workspace/contracts";

import {
  MonacoEditorAdapter,
  type MonacoEditorLike,
} from "./monaco-editor-adapter";

const EDITOR_CONFIGURATION: SurfaceState = {
  id: "editor",
  visible: true,
  order: 0,
  placementId: "main",
  modeId: "code",
  options: {
    "editor.word-wrap": true,
    "editor.minimap": false,
    "editor.font-size": 16,
  },
};

describe("MonacoEditorAdapter", () => {
  it("applies declared editor options and actions", async () => {
    const editor = createEditor();
    const adapter = createAdapter();
    adapter.attach(editor);

    await adapter.configure(EDITOR_CONFIGURATION);
    const result = await adapter.executeAction("surface.editor.focus");

    expect(editor.updateOptions).toHaveBeenCalledWith({
      wordWrap: "on",
      minimap: { enabled: false },
      fontSize: 16,
      readOnly: false,
    });
    expect(editor.focus).toHaveBeenCalledOnce();
    expect(result.accepted).toBe(true);
  });

  it("opens and measures semantic code targets without accepting selectors", async () => {
    let activeFilePath = "styles.css";
    const openFile = vi.fn(async (path: string) => {
      activeFilePath = path;
    });
    const editor = createEditor();
    const adapter = createAdapter({
      openFile,
      getActiveFilePath: () => activeFilePath,
    });
    adapter.attach(editor);
    const target = {
      resolverId: "target.code-range",
      input: {
        filePath: "index.html",
        startLine: 2,
        startColumn: 3,
        endLine: 2,
        endColumn: 9,
      },
    };

    const handle = await adapter.resolveTarget(target, new AbortController().signal);

    expect(openFile).toHaveBeenCalledWith("index.html");
    expect(editor.revealRangeInCenter).toHaveBeenCalled();
    expect(handle.getSnapshot()).toEqual({
      status: "resolved",
      geometry: {
        left: 113,
        top: 220,
        width: 6,
        height: 18,
        fragments: [{ left: 113, top: 220, width: 6, height: 18 }],
      },
    });
  });

  it("reports a lost target while its file is not active", async () => {
    const editor = createEditor();
    const adapter = createAdapter({
      openFile: async () => undefined,
      getActiveFilePath: () => "styles.css",
    });
    adapter.attach(editor);

    const handle = await adapter.resolveTarget(
      {
        resolverId: "target.code-range",
        input: {
          filePath: "index.html",
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 2,
        },
      },
      new AbortController().signal,
    );

    expect(handle.getSnapshot()).toEqual({ status: "lost" });
  });

  it("recovers a target when Monaco mounts after the scene starts", async () => {
    const adapter = createAdapter();
    const handle = await adapter.resolveTarget(
      {
        resolverId: "target.code-range",
        input: {
          filePath: "index.html",
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 6,
        },
      },
      new AbortController().signal,
    );

    expect(handle.getSnapshot()).toEqual({ status: "lost" });
    adapter.attach(createEditor());
    expect(handle.getSnapshot()).toEqual({
      status: "resolved",
      geometry: {
        left: 111,
        top: 220,
        width: 5,
        height: 18,
        fragments: [{ left: 111, top: 220, width: 5, height: 18 }],
      },
    });
  });

  it("measures a multi-line range as clipped per-line fragments instead of editor-width space", async () => {
    const editor = createEditor();
    editor.getModel = vi.fn(() => ({
      getLineMaxColumn: (lineNumber: number) => (lineNumber === 2 ? 12 : 11),
    }));
    editor.getScrolledVisiblePosition = vi.fn(({ lineNumber, column }) => ({
      left: 10 + column * 8,
      top: 20 + (lineNumber - 1) * 18,
      height: 18,
    }));
    const adapter = createAdapter();
    adapter.attach(editor);

    const handle = await adapter.resolveTarget(
      {
        resolverId: "target.code-range",
        input: {
          filePath: "index.html",
          startLine: 2,
          startColumn: 3,
          endLine: 4,
          endColumn: 5,
        },
      },
      new AbortController().signal,
    );

    expect(handle.getSnapshot()).toEqual({
      status: "resolved",
      geometry: {
        left: 118,
        top: 238,
        width: 88,
        height: 54,
        fragments: [
          { left: 134, top: 238, width: 72, height: 18 },
          { left: 118, top: 256, width: 80, height: 18 },
          { left: 118, top: 274, width: 32, height: 18 },
        ],
      },
    });
  });

  it("reports an offscreen range as lost and reconstructs it after editor scrolling", async () => {
    let visible = true;
    let scrollListener = () => undefined;
    const editor = createEditor();
    editor.onDidScrollChange = vi.fn((listener) => {
      scrollListener = listener;
      return { dispose: vi.fn() };
    });
    editor.getScrolledVisiblePosition = vi.fn(({ column }) =>
      visible ? { left: 10 + column, top: 20, height: 18 } : null,
    );
    const adapter = createAdapter();
    adapter.attach(editor);
    const handle = await adapter.resolveTarget(
      {
        resolverId: "target.code-range",
        input: {
          filePath: "index.html",
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 6,
        },
      },
      new AbortController().signal,
    );

    visible = false;
    scrollListener();
    expect(handle.getSnapshot()).toEqual({ status: "lost" });
    visible = true;
    scrollListener();
    expect(handle.getSnapshot()).toEqual(
      expect.objectContaining({ status: "resolved" }),
    );
  });

  it("keeps a long range resolved through only its visible exact fragments", async () => {
    const editor = createEditor();
    editor.getModel = vi.fn(() => ({ getLineMaxColumn: () => 11 }));
    editor.getScrolledVisiblePosition = vi.fn(({ lineNumber, column }) =>
      lineNumber >= 4 && lineNumber <= 6
        ? {
            left: 10 + column * 8,
            top: 20 + (lineNumber - 4) * 18,
            height: 18,
          }
        : null,
    );
    const adapter = createAdapter();
    adapter.attach(editor);

    const handle = await adapter.resolveTarget(
      {
        resolverId: "target.code-range",
        input: {
          filePath: "index.html",
          startLine: 1,
          startColumn: 1,
          endLine: 12,
          endColumn: 4,
        },
      },
      new AbortController().signal,
    );

    expect(handle.getSnapshot()).toEqual({
      status: "resolved",
      geometry: {
        left: 118,
        top: 220,
        width: 80,
        height: 54,
        fragments: [
          { left: 118, top: 220, width: 80, height: 18 },
          { left: 118, top: 238, width: 80, height: 18 },
          { left: 118, top: 256, width: 80, height: 18 },
        ],
      },
    });
  });
});

function createAdapter(
  overrides: Partial<ConstructorParameters<typeof MonacoEditorAdapter>[0]> = {},
): MonacoEditorAdapter {
  return new MonacoEditorAdapter({
    surfaceId: "editor",
    codeTargetResolverId: "target.code-range",
    focusActionId: "surface.editor.focus",
    openFile: async () => undefined,
    getActiveFilePath: () => "index.html",
    ...overrides,
  });
}

function createEditor(): MonacoEditorLike {
  const disposable = { dispose: vi.fn() };
  return {
    focus: vi.fn(),
    updateOptions: vi.fn(),
    getDomNode: vi.fn(() => ({
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 800, height: 500 }),
    }) as HTMLElement),
    getModel: vi.fn(() => ({ getLineMaxColumn: () => 20 })),
    getScrolledVisiblePosition: vi.fn(({ column }) => ({
      left: 10 + column,
      top: 20,
      height: 18,
    })),
    revealRangeInCenter: vi.fn(),
    deltaDecorations: vi.fn(() => ["decoration-1"]),
    onDidScrollChange: vi.fn(() => disposable),
    onDidLayoutChange: vi.fn(() => disposable),
    onDidChangeModel: vi.fn(() => disposable),
  };
}

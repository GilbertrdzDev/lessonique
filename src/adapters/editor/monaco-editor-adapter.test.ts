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
      geometry: { left: 113, top: 220, width: 6, height: 18 },
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
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 800 }),
    }) as HTMLElement),
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

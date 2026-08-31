import { describe, expect, it, vi } from "vitest";

import type { MonacoEditorAdapter } from "@/adapters/editor/monaco-editor-adapter";

import { MonacoGuidanceAdapter } from "./monaco-guidance-adapter";

describe("MonacoGuidanceAdapter", () => {
  it("decorates only registered code targets with the focus effect", () => {
    const dispose = vi.fn();
    const editor = {
      decorateRange: vi.fn(() => dispose),
    } as unknown as MonacoEditorAdapter;
    const adapter = new MonacoGuidanceAdapter({
      editor,
      resolverId: "target.code-range",
      focusEffectId: "effect.focus",
    });
    const target = {
      resolverId: "target.code-range",
      input: {
        filePath: "script.js",
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 4,
      },
    };

    const cleanup = adapter.apply(target, [{ effectId: "effect.focus" }]);
    cleanup();

    expect(editor.decorateRange).toHaveBeenCalledWith(
      target,
      "lessonique-guided-code-range",
    );
    expect(dispose).toHaveBeenCalledOnce();
  });
});

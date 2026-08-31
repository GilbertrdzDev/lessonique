import type { GuidanceEffectInput, TargetRef } from "@/core/platform/contracts";
import type { MonacoEditorAdapter } from "@/adapters/editor/monaco-editor-adapter";

export class MonacoGuidanceAdapter {
  readonly #editor: MonacoEditorAdapter;
  readonly #resolverId: string;
  readonly #focusEffectId: string;

  constructor(options: {
    editor: MonacoEditorAdapter;
    resolverId: string;
    focusEffectId: string;
  }) {
    this.#editor = options.editor;
    this.#resolverId = options.resolverId;
    this.#focusEffectId = options.focusEffectId;
  }

  apply(
    target: TargetRef | undefined,
    effects: readonly GuidanceEffectInput[],
  ): () => void {
    if (
      !target ||
      target.resolverId !== this.#resolverId ||
      !effects.some(({ effectId }) => effectId === this.#focusEffectId)
    ) {
      return () => undefined;
    }
    return this.#editor.decorateRange(target, "lessonique-guided-code-range");
  }
}

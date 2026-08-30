import type { editor, Uri } from "monaco-editor";

import type { WorkspaceFile } from "@/core/workspace/contracts";

export interface MonacoModelApi {
  Uri: {
    from(components: { scheme: string; path: string }): Uri;
  };
  editor: {
    createModel(value: string, language?: string, uri?: Uri): editor.ITextModel;
    getModel(uri: Uri): editor.ITextModel | null;
    setModelLanguage(model: editor.ITextModel, languageId: string): void;
  };
}

export type MonacoLanguageResolver = (
  languageId: string,
) => string | undefined;

export class MissingFileModelError extends Error {
  constructor(path: string) {
    super(`No Monaco model exists for workspace file "${path}".`);
    this.name = "MissingFileModelError";
  }
}

export class FileModelRegistry {
  readonly #monaco: MonacoModelApi;
  readonly #resolveMonacoLanguage: MonacoLanguageResolver;
  readonly #models = new Map<string, editor.ITextModel>();

  constructor(
    monaco: MonacoModelApi,
    resolveMonacoLanguage: MonacoLanguageResolver,
  ) {
    this.#monaco = monaco;
    this.#resolveMonacoLanguage = resolveMonacoLanguage;
  }

  sync(files: readonly WorkspaceFile[]): void {
    const nextPaths = new Set(files.map(({ path }) => path));
    for (const [path, model] of this.#models) {
      if (!nextPaths.has(path)) {
        model.dispose();
        this.#models.delete(path);
      }
    }

    for (const file of files) {
      const language = this.#resolveMonacoLanguage(file.languageId);
      const existing = this.#models.get(file.path);
      if (existing) {
        if (language && existing.getLanguageId() !== language) {
          this.#monaco.editor.setModelLanguage(existing, language);
        }
        applyContentWithoutResettingHistory(existing, file.content);
        continue;
      }

      const uri = this.#createUri(file.path);
      const model =
        this.#monaco.editor.getModel(uri) ??
        this.#monaco.editor.createModel(file.content, language, uri);
      if (model.getValue() !== file.content) {
        applyContentWithoutResettingHistory(model, file.content);
      }
      this.#models.set(file.path, model);
    }
  }

  get(path: string): editor.ITextModel | undefined {
    return this.#models.get(path);
  }

  require(path: string): editor.ITextModel {
    const model = this.get(path);
    if (!model) {
      throw new MissingFileModelError(path);
    }
    return model;
  }

  list(): Array<{ path: string; model: editor.ITextModel }> {
    return [...this.#models].map(([path, model]) => ({ path, model }));
  }

  dispose(): void {
    this.#models.forEach((model) => model.dispose());
    this.#models.clear();
  }

  #createUri(path: string): Uri {
    return this.#monaco.Uri.from({
      scheme: "file",
      path: `/lessonique-workspace/${path.replaceAll("\\", "/")}`,
    });
  }
}

function applyContentWithoutResettingHistory(
  model: editor.ITextModel,
  content: string,
): void {
  if (model.getValue() === content) {
    return;
  }
  model.pushEditOperations(
    [],
    [{ range: model.getFullModelRange(), text: content }],
    () => null,
  );
}

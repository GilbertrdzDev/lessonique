import { describe, expect, it, vi } from "vitest";

import type { WorkspaceFile } from "@/core/workspace/contracts";

import { FileModelRegistry, type MonacoModelApi } from "./file-model-registry";

describe("FileModelRegistry", () => {
  it("creates one independent model per workspace file", () => {
    const { api, createdModels } = createMonacoApi();
    const registry = new FileModelRegistry(api, (id) => id.split(".").at(-1));

    registry.sync([
      createFile("index.html", "language.html", "<main></main>"),
      createFile("styles.css", "language.css", "main {}"),
    ]);

    expect(registry.list().map(({ path }) => path)).toEqual([
      "index.html",
      "styles.css",
    ]);
    expect(createdModels).toHaveLength(2);
    expect(registry.require("index.html")).not.toBe(
      registry.require("styles.css"),
    );
  });

  it("updates content through edit operations so Monaco retains undo history", () => {
    const { api, createdModels } = createMonacoApi();
    const registry = new FileModelRegistry(api, () => "javascript");
    registry.sync([createFile("script.js", "language.javascript", "let a = 1;")]);

    registry.sync([createFile("script.js", "language.javascript", "let a = 2;")]);

    expect(createdModels).toHaveLength(1);
    expect(createdModels[0]?.pushEditOperations).toHaveBeenCalledOnce();
    expect(createdModels[0]?.getValue()).toBe("let a = 2;");
  });

  it("disposes only models removed from the workspace", () => {
    const { api, createdModels } = createMonacoApi();
    const registry = new FileModelRegistry(api, () => "javascript");
    registry.sync([
      createFile("one.js", "language.javascript", "1"),
      createFile("two.js", "language.javascript", "2"),
    ]);

    registry.sync([createFile("two.js", "language.javascript", "2")]);

    expect(createdModels[0]?.dispose).toHaveBeenCalledOnce();
    expect(createdModels[1]?.dispose).not.toHaveBeenCalled();
  });
});

function createFile(
  path: string,
  languageId: string,
  content: string,
): WorkspaceFile {
  return { path, languageId, content, visible: true };
}

function createMonacoApi() {
  const modelsByUri = new Map<string, ReturnType<typeof createModel>>();
  const createdModels: Array<ReturnType<typeof createModel>> = [];
  const api = {
    Uri: {
      from: ({ scheme, path }: { scheme: string; path: string }) => ({
        toString: () => `${scheme}:${path}`,
      }),
    },
    editor: {
      createModel: (value: string, language = "plaintext", uri: { toString(): string }) => {
        const model = createModel(value, language);
        modelsByUri.set(uri.toString(), model);
        createdModels.push(model);
        return model;
      },
      getModel: (uri: { toString(): string }) =>
        modelsByUri.get(uri.toString()) ?? null,
      setModelLanguage: vi.fn(),
    },
  } as unknown as MonacoModelApi;
  return { api, createdModels };
}

function createModel(initialValue: string, languageId: string) {
  let value = initialValue;
  return {
    dispose: vi.fn(),
    getLanguageId: vi.fn(() => languageId),
    getValue: vi.fn(() => value),
    getFullModelRange: vi.fn(() => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: value.length + 1,
    })),
    pushEditOperations: vi.fn(
      (_selections: unknown, edits: Array<{ text: string }>) => {
        value = edits[0]?.text ?? value;
      },
    ),
  };
}

"use client";

import MonacoEditor, {
  loader,
  type Monaco,
  type OnMount,
} from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

import { FileModelRegistry } from "@/adapters/editor/file-model-registry";
import type { MonacoEditorAdapter } from "@/adapters/editor/monaco-editor-adapter";
import type { LanguageProviderRegistry } from "@/core/platform/registries";
import type { WorkspaceFile } from "@/core/workspace/contracts";

loader.config({ paths: { vs: "/vendor/monaco/vs" } });

export type MonacoEditorSurfaceProps = Readonly<{
  activeFilePath?: string;
  adapter: MonacoEditorAdapter;
  files: readonly WorkspaceFile[];
  languages: LanguageProviderRegistry;
  onContentChange(path: string, content: string): Promise<void>;
}>;

export function MonacoEditorSurface({
  activeFilePath,
  adapter,
  files,
  languages,
  onContentChange,
}: MonacoEditorSurfaceProps) {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const registryRef = useRef<FileModelRegistry | null>(null);
  const activeFilePathRef = useRef(activeFilePath);
  const filesRef = useRef(files);
  const synchronizingRef = useRef(false);

  useEffect(() => {
    activeFilePathRef.current = activeFilePath;
    filesRef.current = files;
  }, [activeFilePath, files]);

  const ensureRegistry = (monaco: Monaco): FileModelRegistry => {
    registryRef.current ??= new FileModelRegistry(monaco, (languageId) =>
      languages.get(languageId)?.monacoLanguageId,
    );
    return registryRef.current;
  };

  const handleMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    const registry = ensureRegistry(monaco);
    synchronizingRef.current = true;
    registry.sync(filesRef.current);
    const activePath = activeFilePathRef.current;
    if (activePath) {
      editorInstance.setModel(registry.require(activePath));
    }
    synchronizingRef.current = false;
    const detachAdapter = adapter.attach(editorInstance);
    const contentSubscription = editorInstance.onDidChangeModelContent(() => {
      if (synchronizingRef.current) {
        return;
      }
      const path = activeFilePathRef.current;
      const model = editorInstance.getModel();
      if (path && model) {
        void onContentChange(path, model.getValue());
      }
    });
    editorInstance.onDidDispose(() => {
      contentSubscription.dispose();
      detachAdapter();
      editorRef.current = null;
    });
  };

  useEffect(() => {
    const registry = registryRef.current;
    const editorInstance = editorRef.current;
    if (!registry || !editorInstance) {
      return;
    }
    synchronizingRef.current = true;
    registry.sync(files);
    if (activeFilePath) {
      editorInstance.setModel(registry.require(activeFilePath));
    }
    synchronizingRef.current = false;
  }, [activeFilePath, files]);

  useEffect(
    () => () => {
      registryRef.current?.dispose();
      registryRef.current = null;
    },
    [],
  );

  return (
    <div className="h-full min-h-80" id="workspace-editor-panel" role="tabpanel">
      <MonacoEditor
        beforeMount={ensureRegistry}
        height="100%"
        loading={
          <div className="grid h-full min-h-80 place-items-center text-sm text-muted-foreground">
            Initializing Monaco editor…
          </div>
        }
        onMount={handleMount}
        options={{
          ariaLabel: "Workspace code editor",
          automaticLayout: true,
          contextmenu: true,
          fontFamily:
            "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace",
          lineNumbersMinChars: 3,
          padding: { top: 14, bottom: 14 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
        }}
        theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
      />
    </div>
  );
}

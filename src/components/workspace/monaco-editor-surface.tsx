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
import type { DiagnosticSnapshotStore } from "@/core/code-intelligence";
import type { LanguageProviderRegistry } from "@/core/platform/registries";
import type { WorkspaceFile } from "@/core/workspace/contracts";
import {
  LESSONIQUE_DEEP_OCEAN_THEME_ID,
  lessoniqueDeepOceanTheme,
} from "@/components/workspace/monaco-deep-ocean-theme";
import {
  LESSONIQUE_DAYLIGHT_THEME_ID,
  lessoniqueDaylightTheme,
} from "@/components/workspace/monaco-daylight-theme";
import { WORKSPACE_EDITOR_PANEL_ID } from "@/components/workspace/workspace-tabs";

loader.config({ paths: { vs: "/vendor/monaco/vs" } });

export type MonacoEditorSurfaceProps = Readonly<{
  activeFilePath?: string;
  adapter: MonacoEditorAdapter;
  diagnostics: DiagnosticSnapshotStore;
  files: readonly WorkspaceFile[];
  languages: LanguageProviderRegistry;
  onContentChange(path: string, content: string): Promise<void>;
}>;

export function MonacoEditorSurface({
  activeFilePath,
  adapter,
  diagnostics,
  files,
  languages,
  onContentChange,
}: MonacoEditorSurfaceProps) {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const registryRef = useRef<FileModelRegistry | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const activeFilePathRef = useRef(activeFilePath);
  const filesRef = useRef(files);
  const synchronizingRef = useRef(false);
  const editorTheme =
    resolvedTheme === "dark"
      ? LESSONIQUE_DEEP_OCEAN_THEME_ID
      : LESSONIQUE_DAYLIGHT_THEME_ID;

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

  const handleBeforeMount = (monaco: Monaco) => {
    monacoRef.current = monaco;
    monaco.editor.defineTheme(
      LESSONIQUE_DEEP_OCEAN_THEME_ID,
      lessoniqueDeepOceanTheme,
    );
    monaco.editor.defineTheme(
      LESSONIQUE_DAYLIGHT_THEME_ID,
      lessoniqueDaylightTheme,
    );
    ensureRegistry(monaco);
  };

  const handleMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    const registry = ensureRegistry(monaco);
    synchronizingRef.current = true;
    registry.sync(filesRef.current);
    const activePath = activeFilePathRef.current;
    if (activePath) {
      editorInstance.setModel(registry.require(activePath));
    } else {
      editorInstance.setModel(null);
    }
    synchronizingRef.current = false;
    syncDiagnosticMarkers(monaco, registry, filesRef.current, diagnostics);
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
      monacoRef.current = null;
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
    } else {
      editorInstance.setModel(null);
    }
    synchronizingRef.current = false;
    const monaco = monacoRef.current;
    if (monaco) syncDiagnosticMarkers(monaco, registry, files, diagnostics);
  }, [activeFilePath, diagnostics, files]);

  useEffect(
    () =>
      diagnostics.subscribe(() => {
        const monaco = monacoRef.current;
        const registry = registryRef.current;
        if (monaco && registry) {
          syncDiagnosticMarkers(monaco, registry, filesRef.current, diagnostics);
        }
      }),
    [diagnostics],
  );

  useEffect(
    () => () => {
      registryRef.current?.dispose();
      registryRef.current = null;
    },
    [],
  );

  return (
    <div
      aria-label="Workspace editor"
      className="min-h-0 flex-1 overflow-hidden"
      data-editor-theme={editorTheme}
      id={WORKSPACE_EDITOR_PANEL_ID}
      role="region"
    >
      <MonacoEditor
        beforeMount={handleBeforeMount}
        height="100%"
        loading={
          <div className="grid h-full min-h-0 place-items-center text-sm text-muted-foreground">
            Initializing Monaco editor…
          </div>
        }
        onMount={handleMount}
        options={{
          ariaLabel: "Workspace code editor",
          automaticLayout: true,
          contextmenu: true,
          fontFamily:
            '"Fantasque Sans Mono", ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
          fontLigatures: true,
          lineNumbersMinChars: 3,
          padding: { top: 14, bottom: 14 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
        }}
        theme={editorTheme}
      />
    </div>
  );
}

function syncDiagnosticMarkers(
  monaco: Monaco,
  registry: FileModelRegistry,
  files: readonly WorkspaceFile[],
  diagnostics: DiagnosticSnapshotStore,
): void {
  files.forEach(({ path }) => {
    const markers = diagnostics.get(path)?.markers ?? [];
    monaco.editor.setModelMarkers(
      registry.require(path),
      "lessonique",
      markers.map((marker) => ({
        severity:
          marker.severity === "error"
            ? monaco.MarkerSeverity.Error
            : marker.severity === "warning"
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Info,
        message: marker.message,
        code: marker.code,
        startLineNumber: marker.startLine,
        startColumn: marker.startColumn,
        endLineNumber: marker.endLine,
        endColumn: marker.endColumn,
      })),
    );
  });
}

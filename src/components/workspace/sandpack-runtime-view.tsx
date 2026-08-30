"use client";

import {
  SandpackPreview,
  SandpackProvider,
  useSandpack,
  useSandpackConsole,
} from "@codesandbox/sandpack-react";
import { useEffect, useMemo, useRef } from "react";

import { PreviewBridge } from "@/adapters/preview/preview-bridge";
import { createSandpackPreviewFiles } from "@/adapters/preview/preview-bridge-script";
import type { PreviewSurfaceAdapter } from "@/adapters/preview/preview-surface-adapter";
import type { WorkspaceFile } from "@/core/workspace/contracts";
import type { ConsoleEntry } from "@/core/workspace/contracts";
import type { SandpackRuntimeAdapter } from "@/adapters/runtime/sandpack-runtime-adapter";
import { cn } from "@/lib/utils";

export type PreviewViewport = "desktop" | "tablet" | "mobile";

export type SandpackRuntimeViewProps = Readonly<{
  files: readonly WorkspaceFile[];
  onConsoleEntriesChange(entries: readonly ConsoleEntry[]): void;
  previewAdapter: PreviewSurfaceAdapter;
  runtime: SandpackRuntimeAdapter;
  showPreview?: boolean;
  viewport: PreviewViewport;
}>;

export function SandpackRuntimeView({
  files,
  onConsoleEntriesChange,
  previewAdapter,
  runtime,
  showPreview = true,
  viewport,
}: SandpackRuntimeViewProps) {
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const sandpackFiles = useMemo(
    () => createSandpackPreviewFiles(files),
    [files],
  );
  const activeFile = files.find(({ path }) => path === "index.html")?.path;

  useEffect(() => {
    const bridge = new PreviewBridge(window);
    const detachAdapter = previewAdapter.attachBridge(bridge);
    let detachFrame: (() => void) | undefined;
    let frameRequest = 0;
    const attachFrame = () => {
      const frame = previewContainerRef.current?.querySelector("iframe");
      if (frame) {
        detachFrame = bridge.attach(frame);
      } else {
        frameRequest = window.requestAnimationFrame(attachFrame);
      }
    };
    frameRequest = window.requestAnimationFrame(attachFrame);
    return () => {
      window.cancelAnimationFrame(frameRequest);
      detachFrame?.();
      detachAdapter();
      bridge.dispose();
    };
  }, [previewAdapter]);

  return (
    <SandpackProvider
      files={sandpackFiles}
      options={{
        activeFile: activeFile ? `/${activeFile}` : undefined,
        autorun: true,
        recompileMode: "delayed",
        recompileDelay: 250,
        visibleFiles: files.map(({ path }) => `/${path}`),
      }}
      template="static"
    >
      <SandpackRuntimeBinding
        onConsoleEntriesChange={onConsoleEntriesChange}
        previewAdapter={previewAdapter}
        runtime={runtime}
      />
      <div
        className={cn(
          "mx-auto h-full min-h-52 overflow-hidden rounded-xl border bg-white shadow-sm transition-[width] duration-200",
          !showPreview && "absolute size-px min-h-0 overflow-hidden opacity-0",
          viewport === "tablet" && "w-[min(100%,48rem)]",
          viewport === "mobile" && "w-[min(100%,24.375rem)]",
          viewport === "desktop" && "w-full",
        )}
        data-preview-viewport={viewport}
        aria-hidden={!showPreview}
        ref={previewContainerRef}
      >
        <SandpackPreview
          className="h-full! min-h-52!"
          showOpenInCodeSandbox={false}
          showOpenNewtab={false}
          showRefreshButton={false}
          showRestartButton={false}
          showSandpackErrorOverlay
          style={{ height: "100%" }}
        />
      </div>
    </SandpackProvider>
  );
}

function SandpackRuntimeBinding({
  onConsoleEntriesChange,
  previewAdapter,
  runtime,
}: Readonly<{
  onConsoleEntriesChange(entries: readonly ConsoleEntry[]): void;
  previewAdapter: PreviewSurfaceAdapter;
  runtime: SandpackRuntimeAdapter;
}>) {
  const { sandpack, dispatch } = useSandpack();
  const { logs, reset } = useSandpackConsole({
    maxMessageCount: 100,
    resetOnPreviewRestart: true,
    showSyntaxError: true,
  });
  const sandpackRef = useRef(sandpack);

  useEffect(() => {
    sandpackRef.current = sandpack;
  }, [sandpack]);

  useEffect(() => {
    const detachRuntime = runtime.attachHost({
      replaceFiles: async (files) => {
        const current = sandpackRef.current;
        const currentPaths = new Set(Object.keys(current.files));
        const nextPaths = new Set(Object.keys(files));
        currentPaths.forEach((path) => {
          if (!nextPaths.has(path)) {
            current.deleteFile(path, false);
          }
        });
        current.updateFile(files, undefined, true);
      },
      run: async () => {
        await sandpackRef.current.runSandpack();
      },
      stop: async () => undefined,
      restart: async () => {
        dispatch({ type: "refresh" });
      },
      clearConsole: async () => {
        reset();
      },
    });
    const detachPreview = previewAdapter.attachRuntimeHost({
      reload: async () => dispatch({ type: "refresh" }),
    });
    return () => {
      detachPreview();
      detachRuntime();
    };
  }, [dispatch, previewAdapter, reset, runtime]);

  useEffect(() => {
    const entries: ConsoleEntry[] = logs.map((entry, index) => ({
      id: createConsoleEntryId(entry.id, index),
      kind:
        entry.method === "error"
          ? "error"
          : entry.method === "warn"
            ? "warn"
            : entry.method === "info" || entry.method === "debug"
              ? "info"
              : "log",
      message: formatConsoleValues(entry.data),
      occurredAt: new Date().toISOString(),
    }));
    if (sandpack.error) {
      entries.push({
        id: "console.build-error",
        kind: "build",
        message: formatConsoleValues([sandpack.error]),
        occurredAt: new Date().toISOString(),
      });
    } else if (sandpack.status === "timeout") {
      entries.push({
        id: "console.runtime-timeout",
        kind: "runtime",
        message: "The preview runtime timed out.",
        occurredAt: new Date().toISOString(),
      });
    }
    onConsoleEntriesChange(entries);
  }, [logs, onConsoleEntriesChange, sandpack.error, sandpack.status]);

  return null;
}

function createConsoleEntryId(id: string, index: number): string {
  const safeId = id.replaceAll(/[^A-Za-z0-9._:-]/gu, "-").slice(0, 80);
  return `console.${index}.${safeId || "entry"}`;
}

function formatConsoleValues(
  values: readonly unknown[] | undefined,
): string {
  return (values ?? [])
    .map((value) =>
      typeof value === "string" ? value : safeStringify(value),
    )
    .join(" ")
    .slice(0, 2_000);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[Unserializable runtime value]";
  }
}

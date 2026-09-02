"use client";

import {
  SandpackPreview,
  SandpackProvider,
  useSandpack,
  useSandpackConsole,
} from "@codesandbox/sandpack-react";
import { useEffect, useRef, useState } from "react";

import { PreviewBridge } from "@/adapters/preview/preview-bridge";
import {
  createSandpackPreviewFiles,
  createSandpackPreviewFilesFromRuntime,
} from "@/adapters/preview/preview-bridge-script";
import type { PreviewSurfaceAdapter } from "@/adapters/preview/preview-surface-adapter";
import type { WorkspaceFile } from "@/core/workspace/contracts";
import type { ConsoleEntry } from "@/core/workspace/contracts";
import type { SandpackRuntimeAdapter } from "@/adapters/runtime/sandpack-runtime-adapter";
import { cn } from "@/lib/utils";

export type PreviewViewport = "desktop" | "tablet" | "mobile";

const AUTOMATIC_EXECUTION_DEBOUNCE_MS = 250;
const INITIAL_RUNTIME_RETRY_MS = 100;

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
  const [providerConfiguration] = useState(() => ({
    files: createSandpackPreviewFiles(files),
    options: {
      activeFile: files.find(({ path }) => path === "index.html")
        ? "/index.html"
        : undefined,
      autorun: false,
      visibleFiles: files.map(({ path }) => `/${path}`),
    },
  }));

  useEffect(() => {
    const bridge = new PreviewBridge(window);
    const detachAdapter = previewAdapter.attachBridge(bridge);
    let detachFrame: (() => void) | undefined;
    let attachedFrame: HTMLIFrameElement | undefined;
    let detachFrameLoad: (() => void) | undefined;
    const attachCurrentFrame = () => {
      const frame = previewContainerRef.current?.querySelector("iframe");
      if (!frame || frame === attachedFrame) return;
      detachFrame?.();
      detachFrameLoad?.();
      attachedFrame = frame;
      const handleLoad = () => {
        if (attachedFrame === frame) {
          detachFrame?.();
          detachFrame = bridge.attach(frame);
        }
      };
      frame.addEventListener("load", handleLoad);
      detachFrameLoad = () => frame.removeEventListener("load", handleLoad);
      detachFrame = bridge.attach(frame);
    };
    const frameObserver = new MutationObserver(attachCurrentFrame);
    const container = previewContainerRef.current;
    if (container) {
      frameObserver.observe(container, { childList: true, subtree: true });
    }
    attachCurrentFrame();
    return () => {
      frameObserver.disconnect();
      detachFrameLoad?.();
      detachFrame?.();
      detachAdapter();
      bridge.dispose();
    };
  }, [previewAdapter]);

  return (
    <SandpackProvider
      files={providerConfiguration.files}
      options={providerConfiguration.options}
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
  const dispatchRef = useRef(dispatch);
  const resetConsoleRef = useRef(reset);
  const onConsoleEntriesChangeRef = useRef(onConsoleEntriesChange);
  const consoleEntryTimestampsRef = useRef(new Map<string, string>());
  const managedRuntimePathsRef = useRef<Set<string> | undefined>(undefined);
  const scheduledRunRef = useRef<number | undefined>(undefined);
  const runGenerationRef = useRef(0);
  const automaticExecutionEnabledRef = useRef(true);

  useEffect(() => {
    sandpackRef.current = sandpack;
    dispatchRef.current = dispatch;
    resetConsoleRef.current = reset;
    onConsoleEntriesChangeRef.current = onConsoleEntriesChange;
  }, [dispatch, onConsoleEntriesChange, reset, sandpack]);

  useEffect(() => {
    const clearScheduledRun = () => {
      if (scheduledRunRef.current !== undefined) {
        window.clearTimeout(scheduledRunRef.current);
        scheduledRunRef.current = undefined;
      }
    };
    const cancelScheduledRun = () => {
      clearScheduledRun();
      runGenerationRef.current += 1;
    };
    const clearConsole = () => {
      consoleEntryTimestampsRef.current.clear();
      resetConsoleRef.current();
      onConsoleEntriesChangeRef.current([]);
    };
    const runCurrentFiles = async (
      generation: number,
      retryInitialRun: boolean,
    ) => {
      if (
        generation !== runGenerationRef.current ||
        !automaticExecutionEnabledRef.current
      ) {
        return;
      }
      clearScheduledRun();
      const current = sandpackRef.current;
      const needsInitialRetry = retryInitialRun && current.status === "initial";
      clearConsole();
      await current.runSandpack();
      if (
        needsInitialRetry &&
        generation === runGenerationRef.current &&
        automaticExecutionEnabledRef.current
      ) {
        scheduledRunRef.current = window.setTimeout(() => {
          scheduledRunRef.current = undefined;
          void runCurrentFiles(generation, false);
        }, INITIAL_RUNTIME_RETRY_MS);
      }
    };
    const scheduleRun = () => {
      cancelScheduledRun();
      const generation = runGenerationRef.current;
      scheduledRunRef.current = window.setTimeout(() => {
        scheduledRunRef.current = undefined;
        void runCurrentFiles(generation, true);
      }, AUTOMATIC_EXECUTION_DEBOUNCE_MS);
    };
    const replaceRuntimeFiles = (
      files: Readonly<Record<string, string>>,
      automaticExecutionEnabled: boolean,
    ) => {
      const nextFiles = createSandpackPreviewFilesFromRuntime(files);
      const nextPaths = new Set(Object.keys(nextFiles));
      const current = sandpackRef.current;
      const managedPaths = managedRuntimePathsRef.current ?? nextPaths;
      const removedPaths = [...managedPaths].filter(
        (path) => !nextPaths.has(path),
      );
      const hasChanges =
        removedPaths.length > 0 ||
        Object.entries(nextFiles).some(
          ([path, file]) => current.files[path]?.code !== file.code,
        );
      removedPaths.forEach((path) => current.deleteFile(path, false));
      if (hasChanges) {
        current.updateFile(nextFiles, undefined, false);
      }
      automaticExecutionEnabledRef.current = automaticExecutionEnabled;
      if (automaticExecutionEnabled) {
        scheduleRun();
      } else if (!automaticExecutionEnabled) {
        cancelScheduledRun();
      }
      managedRuntimePathsRef.current = nextPaths;
    };
    const detachRuntime = runtime.attachHost({
      replaceFiles: async (files, automaticExecutionEnabled) => {
        replaceRuntimeFiles(files, automaticExecutionEnabled);
      },
      run: async () => {
        automaticExecutionEnabledRef.current = true;
        cancelScheduledRun();
        await runCurrentFiles(runGenerationRef.current, true);
      },
      stop: async () => {
        automaticExecutionEnabledRef.current = false;
        cancelScheduledRun();
      },
      restart: async () => {
        cancelScheduledRun();
        clearConsole();
        dispatchRef.current({ type: "refresh" });
      },
      clearConsole: async () => {
        clearConsole();
      },
    });
    const detachPreview = previewAdapter.attachRuntimeHost({
      reload: async () => dispatchRef.current({ type: "refresh" }),
    });
    return () => {
      automaticExecutionEnabledRef.current = false;
      cancelScheduledRun();
      detachPreview();
      detachRuntime();
    };
  }, [previewAdapter, runtime]);

  useEffect(() => {
    const timestamps = consoleEntryTimestampsRef.current;
    const entries: ConsoleEntry[] = logs.map((entry, index) => {
      const id = createConsoleEntryId(entry.id, index);
      return {
        id,
        kind:
          entry.method === "error"
            ? "error"
            : entry.method === "warn"
              ? "warn"
              : entry.method === "info" || entry.method === "debug"
                ? "info"
                : "log",
        message: formatConsoleValues(entry.data),
        occurredAt: getConsoleEntryTimestamp(timestamps, id),
      };
    });
    if (sandpack.error) {
      const id = "console.build-error";
      entries.push({
        id,
        kind: "build",
        message: formatConsoleValues([sandpack.error]),
        occurredAt: getConsoleEntryTimestamp(timestamps, id),
      });
    } else if (sandpack.status === "timeout") {
      const id = "console.runtime-timeout";
      entries.push({
        id,
        kind: "runtime",
        message: "The preview runtime timed out.",
        occurredAt: getConsoleEntryTimestamp(timestamps, id),
      });
    }
    const activeIds = new Set(entries.map(({ id }) => id));
    timestamps.keys().forEach((id) => {
      if (!activeIds.has(id)) {
        timestamps.delete(id);
      }
    });
    onConsoleEntriesChange(entries);
  }, [logs, onConsoleEntriesChange, sandpack.error, sandpack.status]);

  return null;
}

function createConsoleEntryId(id: string, index: number): string {
  const safeId = id.replaceAll(/[^A-Za-z0-9._:-]/gu, "-").slice(0, 80);
  return `console.${index}.${safeId || "entry"}`;
}

function getConsoleEntryTimestamp(
  timestamps: Map<string, string>,
  id: string,
): string {
  const existing = timestamps.get(id);
  if (existing) {
    return existing;
  }
  const timestamp = new Date().toISOString();
  timestamps.set(id, timestamp);
  return timestamp;
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

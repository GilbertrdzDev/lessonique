"use client";

import {
  CodeXml,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  Smartphone,
  Square,
  SquareTerminal,
  Tablet,
  Trash2,
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";

import { ProjectFilesPanel } from "@/components/workspace/project-files-panel";
import type { PreviewViewport } from "@/components/workspace/sandpack-runtime-view";
import { WorkspaceConsole } from "@/components/workspace/workspace-console";
import {
  clampVerticalPanelRatio,
  DEFAULT_LOWER_PANEL_RATIO,
  getVerticalPanelRatioFromPointer,
  LOWER_PANEL_SEPARATOR_HEIGHT,
  MAXIMUM_LOWER_PANEL_RATIO,
  MINIMUM_EDITOR_PANEL_HEIGHT,
  MINIMUM_LOWER_PANEL_HEIGHT,
  MINIMUM_LOWER_PANEL_RATIO,
} from "@/components/workspace/vertical-panel-split";
import {
  reorderWorkspaceTabPaths,
  type WorkspaceTabDropPosition,
  WORKSPACE_EDITOR_PANEL_ID,
  WorkspaceTabs,
} from "@/components/workspace/workspace-tabs";
import { useWorkspaceRuntime } from "@/components/workspace/workspace-runtime-provider";
import type { SurfaceConfiguration } from "@/core/platform/contracts";
import type { SurfaceState } from "@/core/workspace/contracts";
import {
  isSameOrDescendantPath,
  replaceWorkspacePathPrefix,
} from "@/core/workspace/workspace-entry-paths";
import {
  P0_ENVIRONMENT_ACTION_IDS,
  P0_ENVIRONMENT_PROFILE_IDS,
  P0_INTERACTION_ANCHOR_IDS,
  P0_SURFACE_IDS,
} from "@/providers/p0";

const MINIMUM_PROJECT_FILES_WIDTH = 208;
const MAXIMUM_PROJECT_FILES_WIDTH = 360;
const DEFAULT_PROJECT_FILES_WIDTH = 256;
const MonacoEditorSurface = dynamic(
  () =>
    import("@/components/workspace/monaco-editor-surface").then(
      ({ MonacoEditorSurface: EditorSurface }) => EditorSurface,
    ),
  {
    loading: () => (
      <WorkspaceRuntimeLoading
        id={WORKSPACE_EDITOR_PANEL_ID}
        label="Loading code editor"
      />
    ),
    ssr: false,
  },
);

const SandpackRuntimeView = dynamic(
  () =>
    import("@/components/workspace/sandpack-runtime-view").then(
      ({ SandpackRuntimeView: RuntimeView }) => RuntimeView,
    ),
  { ssr: false },
);

type ProjectFilesResizeSession = Readonly<{
  pointerId: number;
  startWidth: number;
  startX: number;
}>;

type LowerPanelResizeSession = Readonly<{
  pointerId: number;
  containerTop: number;
  containerHeight: number;
  pointerOffsetY: number;
}>;

type PendingTabPathRemap = Readonly<{
  apply(paths: readonly string[]): string[];
  isReady(filePaths: readonly string[], directoryPaths: readonly string[]): boolean;
}>;

export function ClassroomWorkspace() {
  const workspace = useWorkspaceRuntime();
  const registries = workspace.registries;
  const state = useSyncExternalStore(
    workspace.store.subscribe,
    workspace.store.getSnapshot,
    workspace.store.getSnapshot,
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isProjectFilesCollapsed, setIsProjectFilesCollapsed] = useState(false);
  const [projectFilesWidth, setProjectFilesWidth] = useState(
    DEFAULT_PROJECT_FILES_WIDTH,
  );
  const [lowerPanelRatio, setLowerPanelRatio] = useState(
    DEFAULT_LOWER_PANEL_RATIO,
  );
  const [isLowerPanelResizing, setIsLowerPanelResizing] = useState(false);
  const [openFilePaths, setOpenFilePaths] = useState<string[]>([]);
  const projectFilesResizeSession = useRef<ProjectFilesResizeSession | null>(
    null,
  );
  const lowerPanelResizeSession = useRef<LowerPanelResizeSession | null>(null);
  const lowerPanelResizeFrame = useRef<number | null>(null);
  const pendingLowerPanelRatio = useRef<number | null>(null);
  const workspaceContentRef = useRef<HTMLDivElement>(null);
  const openTabsProfileIdRef = useRef<string | undefined>(undefined);
  const availableFilePathsRef = useRef<string[]>([]);
  const previousActiveFilePathRef = useRef<string | undefined>(undefined);
  const pendingTabPathRemapRef = useRef<PendingTabPathRemap | undefined>(
    undefined,
  );

  useEffect(() => {
    const element = workspaceContentRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setLowerPanelRatio((current) =>
        clampVerticalPanelRatio(current, element.clientHeight),
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (lowerPanelResizeFrame.current !== null) {
        cancelAnimationFrame(lowerPanelResizeFrame.current);
      }
    },
    [],
  );

  useEffect(() => {
    const availableFilePaths = state.files
      .filter(({ visible }) => visible)
      .map(({ path }) => path);
    const profileChanged = openTabsProfileIdRef.current !== state.profileId;
    const activeFileChanged =
      previousActiveFilePathRef.current !== state.activeFilePath;
    const fileCollectionReplaced =
      availableFilePathsRef.current.length > 0 &&
      availableFilePaths.length > 0 &&
      !availableFilePathsRef.current.some((path) =>
        availableFilePaths.includes(path),
      );
    const pendingTabPathRemap = pendingTabPathRemapRef.current;
    const shouldApplyPendingRemap = Boolean(
      pendingTabPathRemap?.isReady(availableFilePaths, state.directories),
    );
    const shouldResetOpenTabs =
      profileChanged || (fileCollectionReplaced && !shouldApplyPendingRemap);

    openTabsProfileIdRef.current = state.profileId;
    availableFilePathsRef.current = availableFilePaths;
    previousActiveFilePathRef.current = state.activeFilePath;

    if (shouldResetOpenTabs) {
      pendingTabPathRemapRef.current = undefined;
    }

    setOpenFilePaths((current) => {
      if (!state.profileId) {
        return current.length === 0 ? current : [];
      }
      if (shouldResetOpenTabs) {
        return availableFilePaths;
      }
      const remapped = shouldApplyPendingRemap && pendingTabPathRemap
        ? pendingTabPathRemap.apply(current)
        : current;
      const next = remapped.filter((path) =>
        availableFilePaths.includes(path),
      );
      if (
        activeFileChanged &&
        !shouldApplyPendingRemap &&
        state.activeFilePath &&
        availableFilePaths.includes(state.activeFilePath) &&
        !next.includes(state.activeFilePath)
      ) {
        next.push(state.activeFilePath);
      }
      return stringArraysEqual(current, next) ? current : next;
    });
    if (shouldApplyPendingRemap) {
      pendingTabPathRemapRef.current = undefined;
    }
  }, [state.activeFilePath, state.directories, state.files, state.profileId]);

  const changeProfile = async (profileId: string) => {
    setIsTransitioning(true);
    setErrorMessage(undefined);
    try {
      await workspace.controller.activateProfile(profileId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsTransitioning(false);
    }
  };

  const executeAction = async (actionId: string) => {
    setErrorMessage(undefined);
    try {
      await workspace.controller.executeAction(actionId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const updateConsoleEntries = useCallback(
    (entries: Parameters<typeof workspace.controller.replaceConsoleEntries>[0]) =>
      workspace.controller.replaceConsoleEntries(entries),
    [workspace],
  );

  const previewSurface = state.surfaces.find(
    ({ id }) => id === P0_SURFACE_IDS.preview,
  );
  const previewViewport = isPreviewViewport(previewSurface?.modeId)
    ? previewSurface.modeId
    : "desktop";
  const editorVisible = isSurfaceVisible(state.surfaces, P0_SURFACE_IDS.editor);
  const previewVisible = isSurfaceVisible(state.surfaces, P0_SURFACE_IDS.preview);
  const consoleVisible = isSurfaceVisible(state.surfaces, P0_SURFACE_IDS.console);
  const openFiles = useMemo(
    () =>
      openFilePaths
        .map((path) => state.files.find((file) => file.path === path))
        .filter((file) => file !== undefined),
    [openFilePaths, state.files],
  );
  const activeOpenFilePath =
    state.activeFilePath && openFilePaths.includes(state.activeFilePath)
      ? state.activeFilePath
      : undefined;

  const openWorkspaceFile = async (path: string) => {
    setOpenFilePaths((current) =>
      current.includes(path) ? current : [...current, path],
    );
    setErrorMessage(undefined);
    try {
      await workspace.controller.openFile(path);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const closeWorkspaceTab = (path: string) => {
    const closingIndex = openFilePaths.indexOf(path);
    if (closingIndex < 0) {
      return;
    }
    const remainingPaths = openFilePaths.filter((candidate) => candidate !== path);
    setOpenFilePaths(remainingPaths);
    if (state.activeFilePath !== path || remainingPaths.length === 0) {
      return;
    }
    const nextActivePath =
      remainingPaths[Math.min(closingIndex, remainingPaths.length - 1)];
    if (nextActivePath) {
      void openWorkspaceFile(nextActivePath);
    }
  };

  const reorderOpenWorkspaceTabs = (
    sourcePath: string,
    targetPath: string,
    position: WorkspaceTabDropPosition,
  ) => {
    setOpenFilePaths((current) => {
      const next = reorderWorkspaceTabPaths(
        current,
        sourcePath,
        targetPath,
        position,
      );
      return stringArraysEqual(current, next) ? current : next;
    });
  };

  const renameWorkspaceFile = async (path: string, nextPath: string) => {
    if (path === nextPath) return;
    const remap: PendingTabPathRemap = {
      apply: (paths) =>
        paths.map((candidate) => (candidate === path ? nextPath : candidate)),
      isReady: (filePaths) =>
        filePaths.includes(nextPath) && !filePaths.includes(path),
    };
    pendingTabPathRemapRef.current = remap;
    try {
      await workspace.controller.renameFile(path, nextPath);
    } catch (error) {
      if (pendingTabPathRemapRef.current === remap) {
        pendingTabPathRemapRef.current = undefined;
      }
      throw error;
    }
  };

  const renameWorkspaceDirectory = async (path: string, nextPath: string) => {
    if (path === nextPath) return;
    const remap: PendingTabPathRemap = {
      apply: (paths) =>
        paths.map((candidate) =>
          isSameOrDescendantPath(candidate, path)
            ? replaceWorkspacePathPrefix(candidate, path, nextPath)
            : candidate,
        ),
      isReady: (_filePaths, directoryPaths) =>
        directoryPaths.includes(nextPath) && !directoryPaths.includes(path),
    };
    pendingTabPathRemapRef.current = remap;
    try {
      await workspace.controller.renameDirectory(path, nextPath);
    } catch (error) {
      if (pendingTabPathRemapRef.current === remap) {
        pendingTabPathRemapRef.current = undefined;
      }
      throw error;
    }
  };

  const changeViewport = async (viewport: PreviewViewport) => {
    const configurations = state.surfaces.map((surface) =>
      toSurfaceConfiguration(
        surface.id === P0_SURFACE_IDS.preview
          ? { ...surface, modeId: viewport }
          : surface,
      ),
    );
    await workspace.controller.configureSurfaces(configurations);
  };

  const handleProjectFilesPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    projectFilesResizeSession.current = {
      pointerId: event.pointerId,
      startWidth: projectFilesWidth,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleProjectFilesPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const session = projectFilesResizeSession.current;
    if (session?.pointerId !== event.pointerId) {
      return;
    }
    setProjectFilesWidth(
      clampProjectFilesWidth(
        session.startWidth + event.clientX - session.startX,
      ),
    );
  };

  const finishProjectFilesResize = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (projectFilesResizeSession.current?.pointerId !== event.pointerId) {
      return;
    }
    projectFilesResizeSession.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleProjectFilesResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setProjectFilesWidth((current) => clampProjectFilesWidth(current - 16));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setProjectFilesWidth((current) => clampProjectFilesWidth(current + 16));
    } else if (event.key === "Home") {
      event.preventDefault();
      setProjectFilesWidth(MINIMUM_PROJECT_FILES_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      setProjectFilesWidth(MAXIMUM_PROJECT_FILES_WIDTH);
    }
  };

  const handleLowerPanelPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const container = workspaceContentRef.current;
    const containerRect = container?.getBoundingClientRect();
    const separatorRect = event.currentTarget.getBoundingClientRect();
    if (!containerRect || containerRect.height <= 0) return;
    lowerPanelResizeSession.current = {
      pointerId: event.pointerId,
      containerTop: containerRect.top,
      containerHeight: containerRect.height,
      pointerOffsetY:
        event.clientY - (separatorRect.top + separatorRect.height / 2),
    };
    event.preventDefault();
    setIsLowerPanelResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleLowerPanelPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const session = lowerPanelResizeSession.current;
    if (session?.pointerId !== event.pointerId) return;
    pendingLowerPanelRatio.current = getVerticalPanelRatioFromPointer({
      clientY: event.clientY,
      containerTop: session.containerTop,
      containerHeight: session.containerHeight,
      pointerOffsetY: session.pointerOffsetY,
    });
    if (lowerPanelResizeFrame.current !== null) return;
    lowerPanelResizeFrame.current = requestAnimationFrame(() => {
      lowerPanelResizeFrame.current = null;
      const nextRatio = pendingLowerPanelRatio.current;
      pendingLowerPanelRatio.current = null;
      if (nextRatio !== null) setLowerPanelRatio(nextRatio);
    });
  };

  const finishLowerPanelResize = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (lowerPanelResizeSession.current?.pointerId !== event.pointerId) return;
    lowerPanelResizeSession.current = null;
    if (lowerPanelResizeFrame.current !== null) {
      cancelAnimationFrame(lowerPanelResizeFrame.current);
      lowerPanelResizeFrame.current = null;
    }
    const finalRatio = pendingLowerPanelRatio.current;
    pendingLowerPanelRatio.current = null;
    if (finalRatio !== null) setLowerPanelRatio(finalRatio);
    setIsLowerPanelResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleLowerPanelResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const containerHeight = workspaceContentRef.current?.clientHeight ?? 600;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setLowerPanelRatio((current) =>
        clampVerticalPanelRatio(current + 0.04, containerHeight),
      );
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setLowerPanelRatio((current) =>
        clampVerticalPanelRatio(current - 0.04, containerHeight),
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setLowerPanelRatio(
        clampVerticalPanelRatio(MINIMUM_LOWER_PANEL_RATIO, containerHeight),
      );
    } else if (event.key === "End") {
      event.preventDefault();
      setLowerPanelRatio(
        clampVerticalPanelRatio(MAXIMUM_LOWER_PANEL_RATIO, containerHeight),
      );
    }
  };

  const lowerPanelVisible = previewVisible || consoleVisible;
  const hasResizableVerticalSplit = editorVisible && lowerPanelVisible;

  return (
    <main
      aria-labelledby="classroom-title"
      className="flex min-h-[32rem] min-w-0 flex-1 flex-col rounded-[1.25rem] border bg-workspace p-3 shadow-panel sm:p-5"
      id="classroom-workspace"
      tabIndex={-1}
    >
      <div
        className="flex flex-wrap items-start justify-between gap-3"
        data-scene-obstruction="true"
      >
        <div>
          <h1 id="classroom-title" className="text-xl font-semibold">
            Lessonique Classroom
          </h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Build, run, and inspect the active learning environment.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          Environment
          <select
            aria-label="Environment profile"
            className="rounded-lg border bg-card px-2.5 py-2 text-xs text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={isTransitioning || !state.profileId}
            onChange={(event) => void changeProfile(event.currentTarget.value)}
            value={state.profileId ?? P0_ENVIRONMENT_PROFILE_IDS.vanillaWeb}
          >
            <option value={P0_ENVIRONMENT_PROFILE_IDS.vanillaWeb}>
              Vanilla Web
            </option>
            <option value={P0_ENVIRONMENT_PROFILE_IDS.javascriptConsole}>
              JavaScript Console
            </option>
          </select>
        </label>
      </div>

      <section
        aria-label="Classroom Workspace"
        className="relative mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-code-surface"
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b bg-card/80 px-3 py-2.5"
          data-scene-obstruction="true"
        >
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-primary">
              <CodeXml aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Workspace</h2>
              <p className="text-[0.68rem] text-muted-foreground">
                {state.status === "idle"
                  ? "Preparing environment"
                  : `${state.files.length} active ${state.files.length === 1 ? "file" : "files"}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <WorkspaceAction
              controls="project-files-panel"
              expanded={!isProjectFilesCollapsed}
              icon={
                isProjectFilesCollapsed ? PanelLeftOpen : PanelLeftClose
              }
              label={
                isProjectFilesCollapsed
                  ? "Expand project files"
                  : "Collapse project files"
              }
              onClick={() =>
                setIsProjectFilesCollapsed((current) => !current)
              }
            />
            <WorkspaceAction
              icon={Play}
              label="Run workspace"
              onClick={() => void executeAction(P0_ENVIRONMENT_ACTION_IDS.run)}
            />
            <WorkspaceAction
              icon={Square}
              label="Stop workspace"
              onClick={() => void executeAction(P0_ENVIRONMENT_ACTION_IDS.stop)}
            />
            <WorkspaceAction
              icon={RotateCcw}
              label="Restart workspace"
              onClick={() => void executeAction(P0_ENVIRONMENT_ACTION_IDS.restart)}
            />
            <WorkspaceAction
              icon={Trash2}
              label="Clear console"
              onClick={() =>
                void executeAction(P0_ENVIRONMENT_ACTION_IDS.clearConsole)
              }
            />
          </div>
        </div>

        {errorMessage ? (
          <p className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {errorMessage}
          </p>
        ) : null}

        {state.status === "idle" ? (
          <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
            Preparing the provider-based workspace…
          </div>
        ) : (
          <div
            className="flex min-h-0 flex-1 flex-col md:flex-row"
            data-slot="workspace-body"
          >
            {!isProjectFilesCollapsed ? (
              <div
                className="relative h-40 w-full shrink-0 md:h-auto md:w-[var(--project-files-width)]"
                data-scene-obstruction="true"
                style={
                  {
                    "--project-files-width": `${projectFilesWidth}px`,
                  } as CSSProperties
                }
              >
                <ProjectFilesPanel
                  activeFilePath={state.activeFilePath}
                  directories={state.directories}
                  files={state.files}
                  onCreateDirectory={(path) =>
                    workspace.controller.createDirectory(path)
                  }
                  onCreateFile={(path) => workspace.controller.createFile(path)}
                  onDeleteDirectory={(path) =>
                    workspace.controller.deleteDirectory(path)
                  }
                  onDeleteFile={(path) => workspace.controller.deleteFile(path)}
                  onRenameDirectory={renameWorkspaceDirectory}
                  onRenameFile={renameWorkspaceFile}
                  onSelect={(path) => void openWorkspaceFile(path)}
                />
                <div
                  aria-label="Resize project files panel"
                  aria-orientation="vertical"
                  aria-valuemax={MAXIMUM_PROJECT_FILES_WIDTH}
                  aria-valuemin={MINIMUM_PROJECT_FILES_WIDTH}
                  aria-valuenow={projectFilesWidth}
                  className="absolute -right-3 top-1/2 z-20 hidden h-20 w-6 -translate-y-1/2 cursor-col-resize touch-none select-none items-center justify-center rounded-full outline-none before:h-9 before:w-1 before:rounded-full before:bg-border before:transition-[height,background-color] hover:before:h-11 hover:before:bg-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:before:h-11 focus-visible:before:bg-primary active:before:bg-primary md:flex"
                  onKeyDown={handleProjectFilesResizeKeyDown}
                  onPointerCancel={finishProjectFilesResize}
                  onPointerDown={handleProjectFilesPointerDown}
                  onPointerMove={handleProjectFilesPointerMove}
                  onPointerUp={finishProjectFilesResize}
                  role="separator"
                  tabIndex={0}
                />
              </div>
            ) : null}
            <div
              className="grid min-h-0 min-w-0 flex-1"
              data-slot="workspace-content"
              data-vertical-split-resizing={isLowerPanelResizing || undefined}
              ref={workspaceContentRef}
              style={{
                gridTemplateRows: hasResizableVerticalSplit
                  ? `minmax(${MINIMUM_EDITOR_PANEL_HEIGHT}px, ${1 - lowerPanelRatio}fr) ${LOWER_PANEL_SEPARATOR_HEIGHT}px minmax(${MINIMUM_LOWER_PANEL_HEIGHT}px, ${lowerPanelRatio}fr)`
                  : "minmax(0, 1fr)",
              }}
            >
              {editorVisible ? (
                <WorkspaceSemanticAnchor
                  anchorId={P0_INTERACTION_ANCHOR_IDS.editor}
                  interactionAdapter={workspace.interactionAnchorAdapter}
                >
                  <WorkspaceTabs
                    activeFilePath={activeOpenFilePath}
                    files={openFiles}
                    onClose={closeWorkspaceTab}
                    onReorder={reorderOpenWorkspaceTabs}
                    onSelect={(path) => void openWorkspaceFile(path)}
                  />
                  <MonacoEditorSurface
                    activeFilePath={activeOpenFilePath}
                    adapter={workspace.monacoEditorAdapter}
                    diagnostics={workspace.codeIntelligence.diagnostics}
                    files={state.files}
                    languages={registries.languages}
                    onContentChange={(path, content) =>
                      workspace.controller.updateFileContent(path, content)
                    }
                  />
                </WorkspaceSemanticAnchor>
              ) : null}

              {hasResizableVerticalSplit ? (
                <div
                  aria-label="Resize editor and console panels"
                  aria-orientation="horizontal"
                  aria-valuemax={Math.round(MAXIMUM_LOWER_PANEL_RATIO * 100)}
                  aria-valuemin={Math.round(MINIMUM_LOWER_PANEL_RATIO * 100)}
                  aria-valuenow={Math.round(lowerPanelRatio * 100)}
                  aria-valuetext={`${Math.round((1 - lowerPanelRatio) * 100)}% editor and ${Math.round(lowerPanelRatio * 100)}% lower panel`}
                  className={`relative z-20 flex cursor-row-resize touch-none select-none items-center justify-center bg-border/70 outline-none before:h-1 before:w-20 before:rounded-full before:transition-colors hover:before:bg-primary focus-visible:ring-2 focus-visible:ring-ring ${isLowerPanelResizing ? "before:bg-primary" : "before:bg-muted-foreground/35"}`}
                  data-slot="editor-console-resizer"
                  onKeyDown={handleLowerPanelResizeKeyDown}
                  onLostPointerCapture={finishLowerPanelResize}
                  onPointerCancel={finishLowerPanelResize}
                  onPointerDown={handleLowerPanelPointerDown}
                  onPointerMove={handleLowerPanelPointerMove}
                  onPointerUp={finishLowerPanelResize}
                  role="separator"
                  tabIndex={0}
                />
              ) : null}

              {lowerPanelVisible ? (
                <div
                  className={
                    previewVisible
                      ? "grid h-full min-h-0 border-t lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]"
                      : "h-full min-h-0 border-t"
                  }
                  data-slot="workspace-lower-panel"
                >
                {previewVisible ? (
                  <WorkspaceSemanticAnchor
                    anchorId={P0_INTERACTION_ANCHOR_IDS.preview}
                    className="flex min-h-0 flex-col overflow-hidden border-b lg:border-r lg:border-b-0"
                    interactionAdapter={workspace.interactionAnchorAdapter}
                  >
                    <div className="flex items-center justify-between border-b bg-card/70 px-3 py-2">
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <Monitor aria-hidden="true" className="size-3.5 text-primary" />
                        Live Preview
                      </span>
                      <div aria-label="Preview viewport" className="flex gap-1">
                        {[
                          { id: "desktop" as const, icon: Monitor, label: "Desktop preview" },
                          { id: "tablet" as const, icon: Tablet, label: "Tablet preview" },
                          { id: "mobile" as const, icon: Smartphone, label: "Mobile preview" },
                        ].map(({ id, icon: Icon, label }) => (
                          <button
                            aria-label={label}
                            aria-pressed={previewViewport === id}
                            className="rounded-md border p-1.5 text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-primary/50 aria-pressed:bg-brand-soft aria-pressed:text-primary"
                            key={id}
                            onClick={() => void changeViewport(id)}
                            type="button"
                          >
                            <Icon aria-hidden="true" className="size-3.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div
                      aria-label="Scrollable live preview"
                      className="min-h-0 flex-1 overflow-auto bg-muted/30 p-3"
                      role="region"
                      tabIndex={0}
                    >
                      <SandpackRuntimeView
                        files={state.files}
                        onConsoleEntriesChange={updateConsoleEntries}
                        previewAdapter={workspace.previewSurfaceAdapter}
                        runtime={workspace.sandpackRuntimeAdapter}
                        viewport={previewViewport}
                      />
                    </div>
                  </WorkspaceSemanticAnchor>
                ) : (
                  <SandpackRuntimeView
                    files={state.files}
                    onConsoleEntriesChange={updateConsoleEntries}
                    previewAdapter={workspace.previewSurfaceAdapter}
                    runtime={workspace.sandpackRuntimeAdapter}
                    showPreview={false}
                    viewport="desktop"
                  />
                )}

                {consoleVisible ? (
                  <WorkspaceSemanticAnchor
                    anchorId={P0_INTERACTION_ANCHOR_IDS.console}
                    className="flex h-full min-h-0 flex-col overflow-hidden"
                    obstruction
                    interactionAdapter={workspace.interactionAnchorAdapter}
                  >
                    <div className="flex items-center gap-2 border-b bg-card/70 px-3 py-2 text-xs font-semibold">
                      <SquareTerminal aria-hidden="true" className="size-3.5 text-primary" />
                      Console
                    </div>
                    <div className="min-h-0 flex-1">
                      <WorkspaceConsole
                        adapter={workspace.consoleSurfaceAdapter}
                        entries={state.consoleEntries}
                      />
                    </div>
                  </WorkspaceSemanticAnchor>
                ) : null}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function WorkspaceAction({
  controls,
  expanded,
  icon: Icon,
  label,
  onClick,
}: Readonly<{
  controls?: string;
  expanded?: boolean;
  icon: typeof Play;
  label: string;
  onClick(): void;
}>) {
  return (
    <button
      aria-controls={controls}
      aria-expanded={expanded}
      aria-label={label}
      className="rounded-lg border bg-background/70 p-2 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </button>
  );
}

function WorkspaceRuntimeLoading({
  id,
  label,
}: Readonly<{ id?: string; label: string }>) {
  return (
    <div
      aria-label={label}
      className="grid min-h-52 flex-1 place-items-center text-sm text-muted-foreground"
      id={id}
      role="status"
    >
      {label}…
    </div>
  );
}

function clampProjectFilesWidth(width: number): number {
  return Math.min(
    MAXIMUM_PROJECT_FILES_WIDTH,
    Math.max(MINIMUM_PROJECT_FILES_WIDTH, width),
  );
}

function stringArraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function WorkspaceSemanticAnchor({
  anchorId,
  children,
  className = "flex min-h-0 flex-col overflow-hidden",
  interactionAdapter,
  obstruction = false,
}: Readonly<{
  anchorId: string;
  children: React.ReactNode;
  className?: string;
  interactionAdapter: ReturnType<typeof useWorkspaceRuntime>["interactionAnchorAdapter"];
  obstruction?: boolean;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    return element
      ? interactionAdapter.registerElement(anchorId, element)
      : undefined;
  }, [anchorId, interactionAdapter]);
  return (
    <div
      className={className}
      data-interaction-anchor={anchorId}
      data-scene-obstruction={obstruction || undefined}
      ref={ref}
    >
      {children}
    </div>
  );
}

function isSurfaceVisible(
  surfaces: readonly SurfaceState[],
  surfaceId: string,
): boolean {
  return surfaces.some(({ id, visible }) => id === surfaceId && visible);
}

function isPreviewViewport(value: string | undefined): value is PreviewViewport {
  return value === "desktop" || value === "tablet" || value === "mobile";
}

function toSurfaceConfiguration(surface: SurfaceState): SurfaceConfiguration {
  return {
    id: surface.id,
    visible: surface.visible,
    order: surface.order,
    ...(surface.placementId ? { placementId: surface.placementId } : {}),
    ...(surface.modeId ? { modeId: surface.modeId } : {}),
    ...(surface.size !== undefined ? { size: surface.size } : {}),
    options: Object.entries(surface.options).map(([optionId, value]) => ({
      optionId,
      value,
    })),
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The workspace could not complete the requested operation.";
}

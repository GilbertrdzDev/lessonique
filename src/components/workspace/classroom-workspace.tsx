"use client";

import {
  CodeXml,
  Monitor,
  Play,
  RotateCcw,
  Smartphone,
  Square,
  SquareTerminal,
  Tablet,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { MonacoEditorSurface } from "@/components/workspace/monaco-editor-surface";
import { SandpackRuntimeView, type PreviewViewport } from "@/components/workspace/sandpack-runtime-view";
import { WorkspaceConsole } from "@/components/workspace/workspace-console";
import { WorkspaceTabs } from "@/components/workspace/workspace-tabs";
import type { SurfaceConfiguration } from "@/core/platform/contracts";
import type { SurfaceState } from "@/core/workspace/contracts";
import { WorkspacePersistence } from "@/core/workspace/persistence";
import {
  createP0ProviderPlatform,
  createP0WorkspaceRuntime,
  P0_ENVIRONMENT_ACTION_IDS,
  P0_ENVIRONMENT_PROFILE_IDS,
  P0_INTERACTION_ANCHOR_IDS,
  P0_SURFACE_IDS,
} from "@/providers/p0";

export function ClassroomWorkspace() {
  const workspace = useMemo(() => createP0WorkspaceRuntime(), []);
  const registries = useMemo(() => createP0ProviderPlatform(), []);
  const state = useSyncExternalStore(
    workspace.store.subscribe,
    workspace.store.getSnapshot,
    workspace.store.getSnapshot,
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const persistence = new WorkspacePersistence(window.localStorage);
    const prepareWorkspace = async () => {
      const persisted = persistence.load();
      try {
        if (persisted) {
          await workspace.controller.restore(persisted);
        } else {
          await workspace.controller.activateProfile(
            P0_ENVIRONMENT_PROFILE_IDS.vanillaWeb,
          );
        }
      } catch {
        persistence.clear();
        await workspace.controller.activateProfile(
          P0_ENVIRONMENT_PROFILE_IDS.vanillaWeb,
        );
      }
      if (active) {
        persistence.save(workspace.store.getSnapshot());
        unsubscribe = workspace.store.subscribe(() => {
          persistence.save(workspace.store.getSnapshot());
        });
      }
    };
    void prepareWorkspace().catch((error: unknown) => {
      if (active) {
        setErrorMessage(getErrorMessage(error));
      }
    });
    return () => {
      active = false;
      unsubscribe?.();
      void workspace.dispose();
    };
  }, [workspace]);

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

  return (
    <main
      aria-labelledby="classroom-title"
      className="flex h-[clamp(46rem,calc(100svh-9rem),56rem)] min-h-0 flex-none flex-col rounded-[1.25rem] border bg-workspace p-3 shadow-panel sm:p-5"
      id="classroom-workspace"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card/80 px-3 py-2.5">
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
            className={
              previewVisible
                ? "grid min-h-0 flex-1 grid-rows-[minmax(22rem,3fr)_minmax(14rem,2fr)]"
                : "grid min-h-0 flex-1 grid-rows-[minmax(24rem,2fr)_minmax(14rem,1fr)]"
            }
          >
            {editorVisible ? (
              <WorkspaceSemanticAnchor
                anchorId={P0_INTERACTION_ANCHOR_IDS.editor}
                interactionAdapter={workspace.interactionAnchorAdapter}
              >
                <WorkspaceTabs
                  activeFilePath={state.activeFilePath}
                  files={state.files}
                  onSelect={(path) => void workspace.controller.openFile(path)}
                />
                <MonacoEditorSurface
                  activeFilePath={state.activeFilePath}
                  adapter={workspace.monacoEditorAdapter}
                  files={state.files}
                  languages={registries.languages}
                  onContentChange={(path, content) =>
                    workspace.controller.updateFileContent(path, content)
                  }
                />
              </WorkspaceSemanticAnchor>
            ) : null}

            <div
              className={
                previewVisible
                  ? "grid min-h-0 border-t lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]"
                  : "min-h-0 border-t"
              }
            >
              {previewVisible ? (
                <WorkspaceSemanticAnchor
                  anchorId={P0_INTERACTION_ANCHOR_IDS.preview}
                  className="flex min-h-0 flex-col overflow-hidden border-b lg:border-b-0 lg:border-r"
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
                  className="flex min-h-0 flex-col overflow-hidden"
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
          </div>
        )}
      </section>
    </main>
  );
}

function WorkspaceAction({
  icon: Icon,
  label,
  onClick,
}: Readonly<{
  icon: typeof Play;
  label: string;
  onClick(): void;
}>) {
  return (
    <button
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

function WorkspaceSemanticAnchor({
  anchorId,
  children,
  className = "flex min-h-0 flex-col overflow-hidden",
  interactionAdapter,
}: Readonly<{
  anchorId: string;
  children: React.ReactNode;
  className?: string;
  interactionAdapter: ReturnType<typeof createP0WorkspaceRuntime>["interactionAnchorAdapter"];
}>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    return element
      ? interactionAdapter.registerElement(anchorId, element)
      : undefined;
  }, [anchorId, interactionAdapter]);
  return (
    <div className={className} data-interaction-anchor={anchorId} ref={ref}>
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

import { FileCode2, X } from "lucide-react";
import {
  type DragEvent as ReactDragEvent,
  useState,
} from "react";

import type { WorkspaceFile } from "@/core/workspace/contracts";
import { cn } from "@/lib/utils";

export type WorkspaceTabsProps = Readonly<{
  activeFilePath?: string;
  files: readonly WorkspaceFile[];
  onClose(path: string): void;
  onReorder(sourcePath: string, targetPath: string, position: WorkspaceTabDropPosition): void;
  onSelect(path: string): void;
}>;

export type WorkspaceTabDropPosition = "after" | "before";

type WorkspaceTabDropTarget = Readonly<{
  path: string;
  position: WorkspaceTabDropPosition;
}>;

export function WorkspaceTabs({
  activeFilePath,
  files,
  onClose,
  onReorder,
  onSelect,
}: WorkspaceTabsProps) {
  const visibleFiles = files.filter(({ visible }) => visible);
  const [draggedPath, setDraggedPath] = useState<string>();
  const [dropTarget, setDropTarget] = useState<WorkspaceTabDropTarget>();

  const resetDragState = () => {
    setDraggedPath(undefined);
    setDropTarget(undefined);
  };

  const updateDropTarget = (
    event: ReactDragEvent<HTMLLIElement>,
    targetPath: string,
  ) => {
    const sourcePath = draggedPath ?? event.dataTransfer.getData("text/plain");
    if (!sourcePath || sourcePath === targetPath) {
      setDropTarget(undefined);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientX < bounds.left + bounds.width / 2
      ? "before"
      : "after";
    setDropTarget((current) =>
      current?.path === targetPath && current.position === position
        ? current
        : { path: targetPath, position },
    );
  };

  return (
    <nav
      aria-label="Open workspace files"
      className="min-w-0 overflow-x-auto border-b bg-card/70 px-2 pt-2"
    >
      <ul className="flex min-w-max items-end">
      {visibleFiles.map((file) => {
        const isActive = file.path === activeFilePath;
        return (
          <li
            className={cn(
              "group relative flex min-w-32 max-w-64 items-center rounded-t-lg border border-b-0 transition-[color,background-color,opacity]",
              isActive
                ? "bg-code-surface text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              draggedPath === file.path && "opacity-45",
              dropTarget?.path === file.path && dropTarget.position === "before" &&
                "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
              dropTarget?.path === file.path && dropTarget.position === "after" &&
                "after:absolute after:inset-y-1 after:right-0 after:w-0.5 after:rounded-full after:bg-primary",
            )}
            data-tab-drop-position={
              dropTarget?.path === file.path ? dropTarget.position : undefined
            }
            data-workspace-tab-item-path={file.path}
            draggable
            key={file.path}
            onDragEnd={resetDragState}
            onDragOver={(event) => updateDropTarget(event, file.path)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", file.path);
              setDraggedPath(file.path);
              setDropTarget(undefined);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourcePath = draggedPath ?? event.dataTransfer.getData("text/plain");
              const target = dropTarget?.path === file.path
                ? dropTarget
                : { path: file.path, position: "before" as const };
              if (sourcePath && sourcePath !== file.path) {
                onReorder(sourcePath, file.path, target.position);
              }
              resetDragState();
            }}
          >
            <button
              aria-controls="workspace-editor-panel"
              aria-pressed={isActive}
              className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
              data-workspace-tab-path={file.path}
              onClick={() => onSelect(file.path)}
              title={file.path}
              type="button"
            >
              <FileCode2 aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{file.path}</span>
            </button>
            <button
              aria-label={`Close file tab ${file.path}`}
              className="mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 group-hover:opacity-100"
              data-close-workspace-tab={file.path}
              onClick={() => onClose(file.path)}
              title={`Close ${file.path}`}
              type="button"
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </li>
        );
      })}
      </ul>
    </nav>
  );
}

export function reorderWorkspaceTabPaths(
  paths: readonly string[],
  sourcePath: string,
  targetPath: string,
  position: WorkspaceTabDropPosition,
): string[] {
  const sourceIndex = paths.indexOf(sourcePath);
  const targetIndex = paths.indexOf(targetPath);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return [...paths];
  }
  const next = [...paths];
  next.splice(sourceIndex, 1);
  const nextTargetIndex = next.indexOf(targetPath);
  next.splice(nextTargetIndex + (position === "after" ? 1 : 0), 0, sourcePath);
  return next;
}

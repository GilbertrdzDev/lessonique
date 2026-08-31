import { FileCode2, X } from "lucide-react";

import type { WorkspaceFile } from "@/core/workspace/contracts";
import { cn } from "@/lib/utils";

export type WorkspaceTabsProps = Readonly<{
  activeFilePath?: string;
  files: readonly WorkspaceFile[];
  onClose(path: string): void;
  onSelect(path: string): void;
}>;

export function WorkspaceTabs({
  activeFilePath,
  files,
  onClose,
  onSelect,
}: WorkspaceTabsProps) {
  const visibleFiles = files.filter(({ visible }) => visible);

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
              "group flex min-w-32 max-w-64 items-center rounded-t-lg border border-b-0 transition-colors",
              isActive
                ? "bg-code-surface text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            key={file.path}
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

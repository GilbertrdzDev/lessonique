import { FileCode2 } from "lucide-react";

import type { WorkspaceFile } from "@/core/workspace/contracts";
import { cn } from "@/lib/utils";

export type WorkspaceTabsProps = Readonly<{
  activeFilePath?: string;
  files: readonly WorkspaceFile[];
  onSelect(path: string): void;
}>;

export function WorkspaceTabs({
  activeFilePath,
  files,
  onSelect,
}: WorkspaceTabsProps) {
  const visibleFiles = files.filter(({ visible }) => visible);

  return (
    <div
      aria-label="Workspace files"
      className="flex min-w-0 items-end overflow-x-auto border-b bg-card/70 px-2 pt-2"
      role="tablist"
    >
      {visibleFiles.map((file) => {
        const isActive = file.path === activeFilePath;
        return (
          <button
            aria-controls="workspace-editor-panel"
            aria-selected={isActive}
            className={cn(
              "flex min-w-32 items-center gap-2 rounded-t-lg border border-b-0 px-3 py-2 text-left text-xs font-medium transition-colors",
              isActive
                ? "bg-code-surface text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            key={file.path}
            onClick={() => onSelect(file.path)}
            role="tab"
            type="button"
          >
            <FileCode2 aria-hidden="true" className="size-3.5 text-primary" />
            <span className="truncate">{file.path}</span>
          </button>
        );
      })}
    </div>
  );
}
